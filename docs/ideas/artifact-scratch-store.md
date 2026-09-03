# Scratch Store: Two Roots per Review

## Problem Statement

How might we let an agent produce review artifacts — reports, screenshots, generated
notes — without writing them into the repository?

Every artifact path today is interpreted relative to `project.path`, which doubles as
the sandbox boundary in `Suikou.Artifacts.Asset.resolve_under/2`. An agent that wants
its output reviewed must therefore write it into the repository, polluting `git status`
and risking an accidental commit. And because that same column carries a unique index,
a linked worktree registers as a *second* project — one path being asked to serve as
both a location and an identity.

## Recommended Direction

Take the path off the project and put both roots on the review.

- **A project stores a label and a repository identity — never a location.** A name, an
  emoji, a gitignore preference, and a nullable `identity`. It has no directory. The
  identity exists for one job: so that reviews from different worktrees of one
  repository land in one project without the agent having to arrange it.
- **A review holds both of its roots.** `project_path` — the checkout it reads code
  from — and `scratch_path` — where the agent's generated output lives. Both are
  written at creation and both are on the row.

Everything else follows. Two worktrees of one repository are two reviews with different
`project_path` values under the same project, grouped by identity rather than by
anything the agent has to remember. Several reviews may share a `project_path`, across
different projects, and nothing about that is a conflict — the path was never an
identity. Resolving a file touches no git command and no derivation at read time: it is
two column reads.

A project without an identity is still legal: a folder made by hand in the UI, holding
whatever reviews you file there. Identity is how reviews find a project by themselves,
not a requirement for one to exist.

### Repository identity

`Suikou.Git.identity/1` takes the first that answers:

1. `git remote get-url origin`, normalised — scheme, credentials, a trailing `.git` and
   the `git@host:path` form all collapse to `github.com/fahchen/suikou`. This is what
   makes worktrees, clones, and a re-clone after `rm -rf` resolve to one project.
2. `git rev-parse --path-format=absolute --git-common-dir`, for a repository with no
   remote. `--git-common-dir` rather than `--git-dir` is the point: a linked worktree
   reports the *main* repository's `.git`, so remote-less worktrees still unify.
3. `nil`, for a directory that is not a git repository.

It is resolved from a directory the caller supplies and stored on the project. The
directory is not kept — it was only ever evidence of which repository this is.

### Where the scratch directory goes

At review creation the server computes and stores:

    scratch_path = Path.join([data_dir(), project.identity, review.id])

`data_dir()` follows the XDG convention already used for `config.toml`:
`$XDG_DATA_HOME/suikou`, defaulting to `~/.local/share/suikou`. The identity becomes
**one directory, not a tree, and is not hashed** — `github.com_fahchen_suikou/<review
id>`. The data directory is then a flat list of repositories a human can scan and
delete from, rather than a deep mirror with a single project buried at the end of one
branch. A project with no identity falls back to its name.

The name is trimmed to the parts that identify a repository *to a person*:

- a remote URL keeps its **host plus the last two segments** — the owner and the
  repository. A port and any middle groups are noise:
  `git.example.com:2222/group/sub/app` becomes `git.example.com_sub_app`.
- a remote-less repository's git directory drops its trailing `.git` and keeps the
  **last two segments**, so `/Users/me/work/app/.git` becomes `work_app` rather than
  restating where the machine happens to keep it.

What survives is sanitised to `[a-z0-9._-]`, parts reducing to nothing, `.` or `..` are
dropped, and the rest joined with `_` — so `_` marks a separator, `-` marks a character
a filename cannot carry, and the name can never climb out of the data directory.

The name is for reading, not for identification. `projects.identity` is the unique key
and every review still lands in its own id-named subdirectory, so two repositories
sharing a directory costs a mixed listing and never an overwritten file. Trimming buys
a readable name at the price of that unlikely case — two remote-less checkouts both at
`work/app` under different roots, say.

Grouping by repository and splitting by review id makes one repository's output one
directory to inspect or delete, with a legible review-sized unit inside. Computing it
once at creation rather than deriving it per read means a renamed `origin` cannot
relocate a live review's directory out from under it.

### The root is encoded in the path, not in a new column

The obvious way to mark an artifact as scratch is a `root` column on `artifacts`. It is
the wrong one, and the reason is worth stating: **the review-relative path is the key
for everything**. `artifacts` has a unique index on `(review_id, file_path)`;
`Reviews.list_files/1` returns `%{path: ...}` entries the frontend keys by;
`fetch_content_by_path/3`, `open_file/2`, `add_files/2` and `remove_files/2` all take a
path; `FileWatcher.changed_path/4` maps an absolute path back to one. A root *beside*
the path means threading a second key through all of them, plus the frontend store,
plus a migration — and it creates a real collision, since a scratch `report.md` and a
repository `report.md` become two rows the unique index cannot tell apart.

Encoding the root *inside* the path avoids all of it:

    @scratch/reports/round-3.md

Every layer above keeps treating the path as an opaque string: no artifact schema
change, no new index, no frontend change, no change to comment anchoring or export, and
no change to any CLI file argument.

The cost, stated plainly: a repository containing a real top-level `@scratch` or
`@project` directory cannot have it reviewed. `@` is not a conventional first character
for a source directory, and the alternative costs a migration and a collision class.

### Root markers in markdown

The same two markers work inside an artifact's markdown, so a report can reference
across roots:

    ![diagram](@project/docs/img/x.png)
    ![shot](@scratch/shots/round-3.png)

`Suikou.Artifacts.Asset.resolve/2` gains one branch: a reference beginning with a
marker resolves from that root's top; anything else keeps resolving relative to the
artifact's own directory, exactly as today. Both branches end in `locate/2`, so
`Path.safe_relative/2` still runs against exactly one base — two sandboxes, not one
sandbox with a hole in it.

The alternatives were worse. *Widening the sandbox to span both roots* would let a
`../` chain cross roots by accident as well as on purpose, so a reference that escapes
one root gets a second chance in the other and the check stops meaning anything.
*Symlinking the repository into the scratch root* forces every later path check to
reason about symlinks, which `Path.safe_relative/2` does not follow — a link named
`repo` pointing at `/` is a traversal hole disguised as a convenience. *Copying
referenced files into scratch* reintroduces snapshotting, which this codebase
deliberately removed in favour of live reads, and is stale the moment the file changes.

The price is that a `@project/…` reference is meaningless outside Suikou: a report
using one stops rendering on GitHub or in an editor preview. That is a real cost, paid
knowingly, and it is confined to references that genuinely need to cross — an ordinary
relative link still works everywhere.

## How an agent files a review into the right project

The grouping has to happen without the agent arranging it, because the agent in a fresh
worktree has no way to know the repository is already registered. So the server does it.

**The normal path — one command.**

    suikou review create --name "Scratch store" lib/app.ex

`launcher.ts` sends `process.cwd()` as `project_path`; there is no flag. The server then:

1. resolves the working directory to a repository root with `git rev-parse --show-toplevel`,
   falling back to the directory itself when it is not a repository;
2. resolves that root to an identity with `Suikou.Git.identity/1`;
3. looks up the project holding that identity;
4. creates the review under it, storing `project_path` and a computed `scratch_path`,
   and creating the scratch directory.

A second worktree of the same repository resolves to the same identity at step 3 and
lands in the same project. The agent does nothing, knows nothing, and cannot get it
wrong.

**When the repository is unknown.** Step 3 finds nothing, and the server refuses rather
than registering silently:

    {"review_id":null,"error":"project_not_found"}

The agent asks the human — the skill's ask-before-registering rule, unchanged — and on
a yes:

    suikou project create --name suikou --path .

`--path` is evidence, not storage: the server resolves it to an identity, stores the
identity, and discards the path. Then it retries `review create`, which now finds the
project. Every later worktree skips this branch entirely.

**When the agent wants to choose.** `--project <id>` is still accepted and overrides
the lookup — for filing a review under a hand-made project, or for a directory that is
not a repository and so has no identity to match on.

**Finding existing work.** `suikou review list --path <dir>` resolves the directory to
an identity and returns every review for that repository, across all its worktrees,
each carrying its `project_id`, `project_path` and `scratch_path`. That is how an agent
picks up a review it did not create, and it answers at the repository level rather than
the directory level — which is the whole point of grouping by identity.

## The single choke point

    @spec Suikou.Reviews.locate(Review.t(), String.t()) ::
            {:ok, base :: String.t(), relative :: String.t()} | {:error, :unsafe_path}

`locate/2` strips a leading `@scratch/` or `@project/` segment, selects
`review.scratch_path` or `review.project_path` accordingly, runs `Path.safe_relative/2`
against that base, and returns both halves. An unmarked path selects the root the
caller was already working in.

## Schema

**`projects`** — a label and an identity, not a location.

    remove :path
    drop   unique_index(:projects, [:path])
    add    :identity, :string                                    # nullable
    create unique_index(:projects, [:identity], where: "identity IS NOT NULL")

The partial index is what lets identity be both unique and optional: a hand-made
project with no repository behind it stores `NULL` and collides with nothing.

**`reviews`** — carries both roots.

    add :project_path, :string    # backfilled from projects.path; NOT NULL after
    add :scratch_path, :string    # backfilled from the formula above; NOT NULL after

One migration, sequenced: backfill `reviews` from `projects.path` *before* dropping
that column. `identity` is left `NULL` — a migration has no business shelling out to
`git` — and `Suikou.Projects.get_project_by_dir/1` claims it on first use, from a
project whose own review already points at the resolved checkout. Existing projects
start grouping with no data-migration script and no guesswork: that review is the proof
the project already reviews this repository.

The backfilled `scratch_path` is grouped by the checkout path for the same reason,
trimmed the same way — `projects_app/<review id>` where a new review would use
`github.com_me_app/<review id>`. Same layout, different heading; the grouping name is
cosmetic and a stored path never moves once written.

## MVP Scope

### In

**1. Review creation writes both roots**

`Suikou.Reviews.create_review/2` takes the checkout directory, resolves it to a
repository root, stores it as `project_path`, computes `scratch_path` (one
`git remote get-url origin` call for the grouping slug, falling back to the basename),
and creates the directory with `File.mkdir_p/1`.

**2. `Suikou.Reviews.locate/2` and its call sites**

| Site | Today | After |
|---|---|---|
| `Artifacts.Asset.resolve_under/2` | `safe_relative` + `Path.join(project.path, …)` | `locate/2` |
| `Artifacts.FileSource.create/2` | same pair, inline | `locate/2` |
| `Artifacts.FileSource.source_path/1` | `Path.join(project.path, file_path)` | `locate/2` |
| `Reviews.file_content_hash/2` | `Path.join(project_path, rel)` | `locate/2` |
| `Reviews.expand/2` | `File.dir?(Path.join(project.path, path))` | `locate/2` |
| `Reviews.file_selection_content_source/2` | `safe_relative` + join | `locate/2` |
| `SuikouWeb.FileStore.assign_abs_path/1` | `Path.join(project_path, path)` | `locate/2` |
| every `Git.*` call in `Reviews` | `project.path` | `review.project_path` |

The `Git.*` row is a substitution, not a rewrite: a diff must be read from the checkout
the review was created against, and a `GitDiff` review can only ever produce
project-root paths, so the scratch root never reaches `Suikou.Git`.

**3. `Suikou.Projects.list_files/3` and `listable?/3` lose the `Project` struct**

They become `(base_path, respect_gitignore?, rel)` — a filesystem walk taking a base
rather than dereferencing `%Project{path: …}`. That is what lets one walk serve both
roots, and with `path` gone from the schema it is no longer optional.

`respect_gitignore` needs no special case: `ignore_rules/1` reads a `.gitignore` at the
base and yields `[]` when absent, so a scratch root without one lists every file, which
is correct.

**4. Selection accepts scratch paths**

No schema change. `selection_paths` may contain `@scratch/…` entries, and a directory
selection of `@scratch` stands for everything the agent has written for that review. A
review with no such entry behaves exactly as it does today.

**5. Root markers in `Asset.resolve/2`**

One branch, as above.

**6. Both roots are watched**

`SuikouWeb.ReviewStore` subscribes `Suikou.FileWatcher` to `review.project_path` and,
when the selection contains a scratch path, to `review.scratch_path` as well.
`changed_path/4` re-prefixes a change under the scratch base. `Suikou.ChangesWatcher`
needs nothing new — it invalidates on the `FsChange` event it already subscribes to.

**7. CLI and skill**

Held to one rule: a change earns its place only if nothing already in the CLI does the
job. Four of an earlier draft's proposals did not survive it — see Not Doing.

| Change | Kind | Why nothing else covers it |
|---|---|---|
| `review list --path <dir>` | new filter on an existing verb | How an agent finds work it did not create. `--path` resolves to an identity and answers for the whole repository, across worktrees; the result already carries `project_id` per review, so one call says what exists and where it is filed. Several reviews may share a `project_path` across projects, and a list says so natively where a single-answer lookup could not. |
| `--project` on `review create` becomes optional | relaxation | Omitted, the server groups by identity — the flow above. Passing it overrides the lookup for a hand-made project or a non-repository directory. |
| `project create --path <dir>` | meaning changes | Same flag. The path is resolved to an identity and discarded rather than stored, so it is evidence of *which repository*, not a location. |
| `project list` reports `identity` where it reported `path` | field | The path is gone; identity is the useful answer and is what grouping keys on. |
| `review create` returns `scratch_path` | field | The agent needs the directory at the moment of creation. One field. |
| `review show` returns `project_path` and `scratch_path` | fields | The same answer for an agent that did not create the review. |
| `project_path` in the `review create` payload | implicit | `launcher.ts` sends `process.cwd()`; the CLI handler resolves it to a repository root with `Git.toplevel/1`. No user-facing flag. |

Scratch paths need no CLI work at all: `@scratch/report.md` is an ordinary positional
path, so `create`, `add-files`, `remove-files` and `set-files` are untouched. That is
the payoff of encoding the root in the path rather than in a column.

Skill changes, in both `packaging/embed/skill.md` and its `~/.claude` twin: create the
review with no `--project` and let the server group it; on `project_not_found`, ask the
human and then `project create --name <repo> --path .`; find existing work with
`review list --path`; write generated deliverables into the `scratch_path` the review
reports; address them as `@scratch/…`; never write into the repository. This is
*shorter* than today's step, which tells the agent to list projects and string-match
`--show-toplevel` — the match moves to the server, where it belongs.

The ordering works with the verbs that already exist — create the review from the diff
or files at hand, write the report into the `scratch_path` it returned, then
`review add-files <id> @scratch/report.md`.

**8. Missing-file rendering**

A `project_path` whose directory has been deleted stays a *per-file* condition: the
errors already exist and already stop at the file. The renderer already has an error
state too — my earlier claim that it rendered blank was wrong; it shows
`Couldn't load file (404).` So the work is one sentence, not one state: say the file is
missing rather than making the reader decode a status code. It pays for itself
independently — a file deleted from the repository mid-review reaches the same path.

**9. Tests**

`Suikou.Reviews.locate/2` over both markers, base selection and traversal rejection;
`Asset.resolve/2` over a marked reference from each root and an unmarked one;
`create_review/2` storing both paths and creating the directory; one reviews-level test
creating a mixed review and asserting both files list, open and read; one migration test
asserting an existing project keeps its reviews and that each gains both paths.

## Key Assumptions to Validate

- [x] The frontend does **not** handle `not_a_file` today — `rg not_a_file assets/src`
      is empty. One visible "file not found" state is the entire deleted-checkout
      handling.
- [ ] Nothing outside `Suikou.Git` still needs a path *on the project*. Verify with
      `rg 'project\.path|project_path'` over `lib/` and `assets/` and check every hit is
      in the table above, a `Git.*` call, or display-only — the board and the project
      settings screen are the likely display-only holdouts, and both simply lose the
      field.
- [ ] Agents genuinely need to emit files for review rather than just diffs — confirm
      against a real session before building any of this. If the agent only ever submits
      a diff, the feature is empty.
- [ ] No repository under review has a top-level `@scratch` or `@project` directory, and
      none plausibly will. This is the one assumption that, if wrong, invalidates the
      encoding rather than merely costing work.

## Not Doing (and Why)

- **A `root` column on `artifacts`** — a migration, a second key threaded through every
  path-keyed API and the frontend store, and a `report.md` collision the unique index
  cannot express. The path prefix buys the same capability for a fraction of the diff.
- **Storing a path on `projects`** — a "default worktree" would be authoritative for
  nothing, stale the moment that checkout is deleted, and would re-tempt every future
  caller to treat a project as a directory. Identity groups without locating; the review
  carries the only paths that are true for it.
- **A `project for --path` verb** — the lookup it would expose now happens inside
  `review create`, which is the only moment it was needed. For the read case,
  `review list --path` answers at the repository level and names each review's project,
  which is strictly more than a project id.
- **Requiring an identity on every project** — a hand-made project holding reviews from
  unrelated directories is legitimate. Identity is how reviews find a project on their
  own, not a precondition for one to exist, so the column is nullable with a partial
  unique index.
- **Auto-creating a project when identity matches nothing** — `review create` returns
  `project_not_found` and stops. Silent registration would fill the board with projects
  nobody asked for, and the ask-before-registering rule exists for that reason.
- **A `review scratch <review-id>` verb** — `review create` returns the path at the one
  moment the agent needs it, and `review show` answers later. A verb whose whole job is
  re-reading a field two other commands already report is surface with no capability
  behind it.
- **A `--worktree` flag on `review create`** — the checkout is the working directory in
  every case anyone has described. `process.cwd()` covers it; a flag for a case nobody
  has hit is a flag to document, test and support forever.
- **Deriving `scratch_path` at read time instead of storing it** — a derived path moves
  when `origin` is renamed, relocating a live review's directory out from under it, and
  costs a git call on every path resolution inside a directory walk.
- **A review-level error state for a deleted checkout** — a review whose `project_path`
  is gone stays open and usable; only the files that cannot be read say so, at render
  time. `resolve_under/2` and `FileSource.read/1` already answer `:not_a_file`, and
  `file_content_hash/2` and `read_content_or_nil/1` already answer `nil`, so comments,
  replies, verdicts and every readable file keep working. Escalating a per-file condition
  would take a working review away over one missing directory.
- **Deleting a review's scratch directory on `review delete`** — the review row is cheap
  to recreate; the agent's generated output is not, and a delete with no undo is the
  wrong default for the only copy of a file. The directory stays and is removable by hand.
- **Letting a review move between checkouts** — `project_path` is set at creation and
  fixed. A review that should read a different checkout is a new review, and pinning is
  what keeps its diff reproducible.
- **A content-addressed blob store** — deduplication and path virtualisation solve
  problems this project does not have. A stored directory is `rm -rf`-able and
  inspectable in Finder, which is worth more.
- **A user-configurable scratch path** — the XDG default is correct until someone
  complains. A config key is one line to add later and impossible to remove.
- **Garbage collection** — grouping by repository then review id already makes stale
  output easy to find and delete. Automatic pruning needs a retention policy nobody has
  asked for, and a bug in one destroys user data.

## Built but not designed here

Two things the design did not cover, found while building:

- **A project with no reviews has no directory to browse.** The board's file picker,
  branch picker and review creation all needed `project.path`; they now use the checkout
  of the project's most recent review. A project that has none — created in the UI, never
  used from the CLI — gets empty pickers. The CLI path is unaffected, since it always
  supplies a working directory. Giving the UI a directory prompt at review creation is
  the fix, and it is a UI design question rather than a schema one.
- **The scratch directory is created for real during tests.** `Suikou.ReviewRoots`
  therefore reads `:data_dir` from application config before falling back to XDG, and
  `config/test.exs` points it at `tmp/scratch`. Without that, running the suite would
  litter the developer's real data directory.

## Settled while building

**What an unmarked reference means.** The checkout is the default root: a
reference with no marker is a path under it, and `@scratch/` opts into the
review's scratch directory. Only an artifact that already lives in the checkout
resolves a reference relative to its own directory — that is where a relative
link has always pointed, and it is what keeps an ordinary repository README
rendering unchanged.

The cost is that a scratch report reaching for a file beside itself must say
`@scratch/shots/x.png` rather than `shots/x.png`. The gain is that the common
case — a report pointing at the code it is about — needs no marker at all, and
that one rule holds in both the markdown renderer and the artifact asset route.
