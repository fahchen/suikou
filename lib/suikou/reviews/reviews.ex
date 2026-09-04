defmodule Suikou.Reviews do
  @moduledoc """
  Reviews: a reviewer selects files and whole directories under a project to
  review together. The selection is stored verbatim on the review's
  `FileSelection` source (a directory path stands for every file beneath it) and
  expanded against disk on demand, so files added under a selected directory join
  automatically.
  A `Suikou.Schemas.Artifact` (round 0, draft) is minted lazily the first time a
  file is opened (`open_file/2`); deselecting a file soft-removes its artifact
  while keeping its critique history, and reopening a covered file restores it
  (see BDR-0018).

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Events
  alias Suikou.Git
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.ReviewRoots
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff

  @doc """
  Creates a review under a project from a non-empty selection of files and
  directories, reading them from the checkout at `params.project_path`. Only the
  selection is stored — no artifacts are minted. Files become artifacts lazily
  when first opened (see `open_file/2`).

  ## Examples

      Suikou.Reviews.create_review(project, %{name: "Launch docs", project_path: "/projects/app", selections: ["docs", "plan.md"]})
      #=> {:ok, %Suikou.Schemas.Review{name: "Launch docs"}}

      Suikou.Reviews.create_review(project, %{name: "Launch docs", project_path: "/projects/app", selections: []})
      #=> {:error, :no_files}

  """
  @spec create_review(Project.t(), map()) ::
          {:ok, Review.t()}
          | {:error, :no_files | scratch_error() | Ecto.Changeset.t()}
  def create_review(%Project{} = project, params) do
    selections = Map.get(params, :selections, [])

    changeset =
      Review.create_changeset(project, project_path(params), %{
        name: Map.get(params, :name),
        respect_gitignore: Map.get(params, :respect_gitignore),
        source: %{__type__: "file_selection", selection_paths: selections}
      })

    cond do
      selections == [] -> {:error, :no_files}
      not changeset.valid? -> {:error, changeset}
      true -> insert_with_roots(project, changeset)
    end
  end

  # Stored as given, only expanded. Deciding *which* directory a checkout is —
  # a repository root rather than the subdirectory an agent happened to run in —
  # belongs to the adapter that knows where the caller stood, not here.
  defp project_path(params), do: params |> Map.get(:project_path, ".") |> Path.expand()

  # `scratch_path` is named for the review's own id, so it can only be written
  # once the row exists. The directory is created here so the path a caller is
  # handed back is usable immediately — and a review whose scratch directory
  # could not be created is rolled back rather than handed out pointing at
  # nothing, since a permission or disk error is the caller's to report.
  defp insert_with_roots(%Project{} = project, changeset) do
    Repo.transaction(fn ->
      review = Repo.insert!(changeset)
      scratch = ReviewRoots.scratch_dir(project, review.id)

      case File.mkdir_p(scratch) do
        :ok -> review |> Review.scratch_changeset(scratch) |> Repo.update!()
        {:error, reason} -> Repo.rollback({:scratch_unwritable, reason})
      end
    end)
  end

  @doc """
  Returns the checkout most recently reviewed under `project`, or `nil` when it
  has no reviews yet. The board browses and creates from this: a project is a
  label with no directory of its own, so the last checkout its reviews used is
  the only working directory it can offer.

  ## Examples

      Suikou.Reviews.latest_project_path(project)
      #=> "/projects/app"

  """
  @spec latest_project_path(Project.t()) :: String.t() | nil
  def latest_project_path(%Project{} = project) do
    query =
      from(r in Review,
        as: :review,
        where: r.project_id == ^project.id,
        order_by: [desc: r.id],
        limit: 1,
        select: r.project_path
      )

    Repo.one(query)
  end

  @doc """
  Answers whether `review`'s file listings skip `.gitignore` matches. A review
  answers for itself when it was set, and falls back to its project otherwise, so
  one noisy review can be loosened without loosening the whole board.

  ## Examples

      Suikou.Reviews.respect_gitignore?(review)
      #=> true

  """
  @spec respect_gitignore?(Review.t()) :: boolean()
  def respect_gitignore?(%Review{respect_gitignore: nil} = review) do
    review = Repo.preload(review, :project)
    review.project.respect_gitignore
  end

  def respect_gitignore?(%Review{respect_gitignore: respect}), do: respect

  @doc """
  Files a review under another project. A project is a label, so this only
  changes where the review is listed: its checkout, its comments and its history
  all belong to the review and come along untouched.

  Its scratch directory keeps the heading it was created under — a stored path
  never moves, and the generated files are already sitting there.

  ## Examples

      Suikou.Reviews.move_review(review, other_project)
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec move_review(Review.t(), Project.t()) ::
          {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def move_review(%Review{} = review, %Project{} = project) do
    review
    |> Review.move_changeset(project)
    |> Repo.update()
    |> broadcast_review_change()
  end

  @doc """
  Sets whether a review's file listings respect `.gitignore`, or clears the
  override with `nil` so its project decides again.

  ## Examples

      Suikou.Reviews.set_respect_gitignore(review, false)
      #=> {:ok, %Suikou.Schemas.Review{respect_gitignore: false}}

  """
  @spec set_respect_gitignore(Review.t(), boolean() | nil) ::
          {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def set_respect_gitignore(%Review{} = review, respect) do
    review
    |> Review.gitignore_changeset(respect)
    |> Repo.update()
    |> broadcast_review_change()
  end

  @doc """
  Lists every checkout reviews already read from, most recently used first and
  without repeats. The board completes a directory from this rather than asking
  a human to retype one, since a project holds no path of its own.

  ## Examples

      Suikou.Reviews.list_checkouts()
      #=> ["/projects/app", "/projects/docs"]

  """
  @spec list_checkouts() :: [String.t()]
  def list_checkouts do
    query =
      from(r in Review,
        as: :review,
        group_by: r.project_path,
        order_by: [desc: max(r.id)],
        select: r.project_path
      )

    Repo.all(query)
  end

  @doc """
  Lists reviews that read from the repository `dir` belongs to, newest first,
  across every worktree of it and every project they are filed under. This is
  how an agent finds work it did not create from nothing but a directory.

  ## Examples

      Suikou.Reviews.list_for_dir("/projects/app")
      #=> [%Suikou.Schemas.Review{project_path: "/projects/app"}]

  """
  @spec list_for_dir(String.t()) :: [Review.t()]
  def list_for_dir(dir) do
    root = Path.expand(dir)

    # The project match is what carries sibling worktrees: they were grouped by
    # repository identity at creation, so one lookup reaches all of them. The
    # path match catches a review filed under a hand-picked project, whose
    # identity says nothing about this checkout.
    from(r in Review, as: :review, order_by: [desc: r.id])
    |> where_at_or_grouped_with(root)
    |> Repo.all()
    |> preload_active()
  end

  defp where_at_or_grouped_with(query, root) do
    case Projects.get_project_by_dir(root) do
      %Project{id: id} ->
        where(query, [review: r], r.project_path == ^root or r.project_id == ^id)

      nil ->
        where(query, [review: r], r.project_path == ^root)
    end
  end

  @doc """
  Lists the candidate branches of the checkout at `path`, together with its
  resolved default branch, for the board's diff-review creation picker (see
  BDR-0020).

  Returns local branches under `:branches` and `origin/*` remote-tracking
  branches under `:remote_branches`, each sorted by descending commit date.
  `:default` is the repository default branch via `Suikou.Git.default_branch/1`
  and is the suggested base. `:remote_branches` is `[]` when no `origin`
  remote is configured.

  Returns `{:error, :not_a_git_repo}` when `path` is not a git working tree,
  and `{:error, :git_error}` when git fails.

  ## Examples

      Suikou.Reviews.list_branches("/projects/app")
      #=> {:ok, %{branches: ["topic", "main"], remote_branches: ["origin/main"], default: "main"}}

  """
  @spec list_branches(String.t()) ::
          {:ok, %{branches: [String.t()], remote_branches: [String.t()], default: String.t()}}
          | {:error, :not_a_git_repo | :git_error}
  def list_branches(path) do
    with {:ok, branches} <- local_or_error(path),
         {:ok, remote_branches} <- remote_or_error(path),
         {:ok, default} <- default_or_error(path) do
      {:ok, %{branches: branches, remote_branches: remote_branches, default: default}}
    end
  end

  defp local_or_error(path) do
    case Git.list_branches(path) do
      {:ok, branches} -> {:ok, branches}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, :git_error} -> {:error, :git_error}
    end
  end

  defp remote_or_error(path) do
    case Git.list_remote_branches(path) do
      {:ok, branches} -> {:ok, branches}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, :git_error} -> {:error, :git_error}
    end
  end

  defp default_or_error(path) do
    case Git.default_branch(path) do
      {:ok, ref} -> {:ok, ref}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
    end
  end

  @doc """
  Creates a git-diff review under a project: its artifacts are the files
  changed between `base_ref` and `head_ref` with three-dot merge-base
  semantics. Refs are fixed at creation — changing branches means a new
  review (see BDR-0020). When `base_ref` is omitted it defaults to the
  repository's default branch.

  ## Examples

      Suikou.Reviews.create_diff_review(project, %{name: "Topic", base_ref: "main", head_ref: "topic"})
      #=> {:ok, %Suikou.Schemas.Review{}}

      Suikou.Reviews.create_diff_review(project, %{name: "Topic", head_ref: "missing"})
      #=> {:error, :head_ref_not_found}

  """
  @spec create_diff_review(Project.t(), map()) ::
          {:ok, Review.t()}
          | {:error,
             :not_a_git_repo
             | :missing_head_ref
             | :base_ref_not_found
             | :head_ref_not_found
             | :no_changes
             | :git_error
             | scratch_error()
             | Ecto.Changeset.t()}
  def create_diff_review(%Project{} = project, params) do
    path = project_path(params)

    with :ok <- ensure_git_repo(path),
         {:ok, base} <- resolve_base_ref(path, params),
         {:ok, head} <- fetch_head_ref(params),
         :ok <- ensure_ref(path, base, :base_ref_not_found),
         :ok <- ensure_ref(path, head, :head_ref_not_found),
         :ok <- ensure_changes(path, base, head) do
      changeset =
        Review.create_changeset(project, path, %{
          name: Map.get(params, :name),
          respect_gitignore: Map.get(params, :respect_gitignore),
          source: %{
            __type__: "git_diff",
            base_ref: base,
            head_ref: head
          }
        })

      if changeset.valid?, do: insert_with_roots(project, changeset), else: {:error, changeset}
    end
  end

  @doc """
  Replaces a review's stored selection. Only existing artifacts are reconciled
  against the new selection's expansion: a soft-removed artifact whose file is
  covered again is restored, and an active artifact no longer covered is
  soft-removed (keeping its critique history). No new artifacts are minted —
  newly covered files become artifacts lazily on first open.

  ## Examples

      Suikou.Reviews.set_selection(review, ["lib", "readme.md"])
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec set_selection(Review.t(), [String.t()]) :: {:ok, Review.t()}
  def set_selection(%Review{source: %FileSelection{}} = review, selections) do
    # Force-load every artifact, including soft-removed ones, so a re-covered
    # file is restored rather than left dangling (see BDR-0018).
    review = Repo.preload(review, [:project, :artifacts], force: true)
    target = MapSet.new(expand(review, selections))
    artifacts = review.artifacts

    result =
      Repo.transaction(fn ->
        updated = review |> Review.selection_changeset(selections) |> Repo.update!()

        for artifact <- artifacts,
            do: reconcile!(artifact, MapSet.member?(target, artifact.file_path))

        updated
      end)

    broadcast_review_change(result)
  end

  @doc """
  Drops a single path from a file-selection review, soft-removing its artifact
  if one was minted (history preserved) and shrinking the stored selection so
  the file stops appearing in the file list. Used to clear a row whose source
  was deleted or moved. Errors for diff reviews, whose file list is derived from
  the diff and can't be edited by hand.

  ## Examples

      Suikou.Reviews.remove_file(review, "docs/old.md")
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec remove_file(Review.t(), String.t()) ::
          {:ok, Review.t()} | {:error, :not_a_file_selection}
  def remove_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    # ponytail: literal-path removal. A file covered only via a parent directory
    # in the selection stays listed; explicit-path selections (the common case)
    # drop cleanly.
    set_selection(review, paths -- [path])
  end

  def remove_file(%Review{source: %GitDiff{}}, _path), do: {:error, :not_a_file_selection}

  @doc """
  Adds paths to a file-selection review's selection (union, de-duplicated),
  restoring soft-removed artifacts a newly-covered path brings back. An
  incremental edit — the caller passes only the paths to add, not the whole
  selection. Errors for diff reviews, whose file list is derived from the diff.

  ## Examples

      Suikou.Reviews.add_files(review, ["docs", "readme.md"])
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec add_files(Review.t(), [String.t()]) ::
          {:ok, Review.t()} | {:error, :not_a_file_selection}
  def add_files(%Review{source: %FileSelection{selection_paths: paths}} = review, added) do
    set_selection(review, Enum.uniq(paths ++ added))
  end

  def add_files(%Review{source: %GitDiff{}}, _added), do: {:error, :not_a_file_selection}

  @doc """
  Drops paths from a file-selection review's selection, soft-removing any minted
  artifacts (history preserved). An incremental edit — the caller passes only the
  paths to remove. Literal-path removal, like `remove_file/2`. Errors for diff
  reviews.

  ## Examples

      Suikou.Reviews.remove_files(review, ["docs/old.md", "stale.md"])
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec remove_files(Review.t(), [String.t()]) ::
          {:ok, Review.t()} | {:error, :not_a_file_selection}
  def remove_files(%Review{source: %FileSelection{selection_paths: paths}} = review, removed) do
    set_selection(review, paths -- removed)
  end

  def remove_files(%Review{source: %GitDiff{}}, _removed), do: {:error, :not_a_file_selection}

  @doc """
  Opens a covered file in the review, returning its artifact — minting it (round
  0) on first open, restoring it if it was soft-removed, or returning the
  existing one. Rejects a path not covered by the stored selection.

  ## Examples

      Suikou.Reviews.open_file(review, "docs/plan.md")
      #=> {:ok, %Suikou.Schemas.Artifact{}}

      Suikou.Reviews.open_file(review, "not/selected.md")
      #=> {:error, :not_covered}

  """
  @spec open_file(Review.t(), String.t()) ::
          {:ok, Artifact.t()}
          | {:error, :not_covered | :not_a_git_repo | :git_error | Artifacts.create_error()}
  def open_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    review = Repo.preload(review, :project)

    if path in expand(review, paths) do
      mint_or_get(review, path, &Artifacts.create_from_file/2)
    else
      {:error, :not_covered}
    end
  end

  def open_file(%Review{source: %GitDiff{} = git_diff} = review, path) do
    review = Repo.preload(review, :project)

    case changed_paths(review.project_path, git_diff) do
      {:ok, paths} ->
        if path in paths,
          do: mint_or_get(review, path, &Artifacts.create_from_diff/2),
          else: {:error, :not_covered}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Renames a review, leaving its files and critique history untouched.

  ## Examples

      Suikou.Reviews.rename_review(review, "Spec pass")
      #=> {:ok, %Suikou.Schemas.Review{name: "Spec pass"}}

  """
  @spec rename_review(Review.t(), String.t()) ::
          {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def rename_review(%Review{} = review, name) do
    review |> Review.rename_changeset(%{name: name}) |> Repo.update()
  end

  @doc """
  Deletes a review and every artifact, round, and comment beneath it (the
  database cascades on the foreign keys). Unlike removing a single file, this
  discards the review's whole critique history.

  ## Examples

      Suikou.Reviews.delete_review(review)
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec delete_review(Review.t()) :: {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def delete_review(%Review{} = review), do: Repo.delete(review)

  @typedoc """
  The scratch directory could not be created — a permission or disk error from
  `File.mkdir_p/1`, carried so the caller can say which.
  """
  @type scratch_error() :: {:scratch_unwritable, File.posix()}

  @typedoc """
  Diff review's ref identity: the branch names the reviewer picked at creation.
  Refs are resolved live on every render — a vanished ref surfaces as an error
  page in the workspace (see BDR-0025). `refs_valid` is `false` when either
  side no longer resolves in the project's git tree.
  """
  @type refs_snapshot() :: %{
          base_ref: String.t(),
          head_ref: String.t(),
          refs_valid: boolean()
        }

  @doc """
  Live ref snapshot for a review. `nil` for a `FileSelection` review; for a
  `GitDiff` review, returns the stored branch names plus a `refs_valid` flag
  that is `false` iff either ref no longer resolves in the project's git tree.
  Powers the workspace's error-page fallback (BDR-0025).

  ## Examples

      Suikou.Reviews.refs_snapshot(diff_review)
      #=> %{base_ref: "main", head_ref: "feature/x", refs_valid: true}

      Suikou.Reviews.refs_snapshot(file_review)
      #=> nil
  """
  @spec refs_snapshot(Review.t()) :: refs_snapshot() | nil
  def refs_snapshot(%Review{source: %FileSelection{}}), do: nil

  def refs_snapshot(%Review{source: %GitDiff{} = git_diff} = review) do
    %{
      base_ref: git_diff.base_ref,
      head_ref: git_diff.head_ref,
      refs_valid:
        Git.ref_exists?(review.project_path, git_diff.base_ref) and
          Git.ref_exists?(review.project_path, git_diff.head_ref)
    }
  end

  @doc """
  Lists the commits reachable from a diff review's `head_ref` but not from its
  `base_ref` (three-dot semantics), newest first. Each entry carries the full
  SHA and the commit subject. Powers the future commit-by-commit navigation
  axis for diff reviews (see Phase P4 diff-review requirements 2026-07-10);
  the axis stays orthogonal to the working-tree state axis (staged/unstaged),
  which lives on `head_ref` (worktree) and is not exposed here.

  Returns `{:error, :not_a_diff_review}` for a file-selection review, so the
  caller can 404 without pattern-branching on the source type.

  ## Examples

      Suikou.Reviews.list_diff_commits(diff_review)
      #=> {:ok, [%{sha: "0a1b...", subject: "second"}, %{sha: "9f8e...", subject: "first"}]}

      Suikou.Reviews.list_diff_commits(file_review)
      #=> {:error, :not_a_diff_review}

  """
  @spec list_diff_commits(Review.t()) ::
          {:ok, [Git.commit_entry()]}
          | {:error, :not_a_diff_review | Git.list_commits_error()}
  def list_diff_commits(%Review{source: %FileSelection{}}), do: {:error, :not_a_diff_review}

  def list_diff_commits(%Review{source: %GitDiff{} = git_diff} = review) do
    Git.list_commits(review.project_path, git_diff.base_ref, git_diff.head_ref)
  end

  @doc """
  Returns the unified diff `sha` introduces vs. its first parent (root commits
  diff against the empty tree), scoped to a diff review's project. Answers
  `{:inline, diff_text, "text/x-diff"}` so the controller can serve it with the
  same shape as `fetch_content_by_path/2`.

  Powers the commit-by-commit navigation axis for diff reviews — the frontend
  fetches one commit's whole patch and `@pierre/diffs` splits it per file.

  Returns `{:error, :not_a_diff_review}` for a file-selection review; other
  errors mirror `Git.commit_diff/2`.

  ## Examples

      Suikou.Reviews.fetch_commit_diff(diff_review, "0a1b2c3")
      #=> {:ok, {:inline, "diff --git a/lib/app.ex b/lib/app.ex\\n...", "text/x-diff"}}

      Suikou.Reviews.fetch_commit_diff(file_review, "0a1b2c3")
      #=> {:error, :not_a_diff_review}

  """
  @spec fetch_commit_diff(Review.t(), String.t()) ::
          {:ok, content_source()}
          | {:error, :not_a_diff_review | Git.commit_diff_error()}
  def fetch_commit_diff(%Review{source: %FileSelection{}}, _sha),
    do: {:error, :not_a_diff_review}

  def fetch_commit_diff(%Review{source: %GitDiff{}} = review, sha) when is_binary(sha) do
    case Git.commit_diff(review.project_path, sha) do
      {:ok, diff} -> {:ok, {:inline, diff, "text/x-diff"}}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Fetches a review by id with its project and active (not soft-removed) files
  preloaded, or `nil` when none exists.

  ## Examples

      Suikou.Reviews.get_review(review.id)
      #=> %Suikou.Schemas.Review{}

      Suikou.Reviews.get_review("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get_review(Ecto.UUID.t()) :: Review.t() | nil
  def get_review(review_id) do
    preload_active(Repo.get(Review, review_id))
  end

  @doc """
  Lists a project's reviews, newest first, each with its active files preloaded.

  ## Examples

      Suikou.Reviews.list_for_project(project)
      #=> [%Suikou.Schemas.Review{}]

  """
  @spec list_for_project(Project.t()) :: [Review.t()]
  def list_for_project(%Project{} = project) do
    from(r in Review, as: :review, where: r.project_id == ^project.id, order_by: [desc: r.id])
    |> Repo.all()
    |> preload_active()
  end

  @doc """
  Lists a review's current files by expanding its selection against disk. Each
  entry carries the file path, the id of its already-minted active artifact
  (or `nil` when the file has not been opened yet),
  `content_hash` — a stable cache key for the file's current bytes (SHA-256
  hex of the on-disk file for a selection review; the head ref's git blob hash
  for a diff review) — and `change_status`, the file's diff modification kind
  for a diff review (`:added | :modified | :deleted | :renamed | :copied |
  :type_changed`) or `nil` for a selection review. `content_hash` is `nil`
  when the file cannot be read at the source (deleted-at-head, unreadable,
  etc.). Diff reviews also carry `added`/`deleted` line counts from
  `git diff --numstat` (both `nil` for binary files or file-selection reviews)
  so the navigator can render per-file `+N / −M` chips. Walked on demand,
  never on the board render.

  ## Examples

      Suikou.Reviews.list_files(review)
      #=> [%{path: "docs/plan.md", artifact_id: nil, content_hash: "AB12...",
      #     change_status: nil, added: nil, deleted: nil}]

  """
  @spec list_files(Review.t()) :: [file_entry()]
  def list_files(%Review{source: %FileSelection{selection_paths: paths}} = review) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}
    # Soft-removed artifacts (deselected in a prior round) surface as dimmed
    # rows so the reviewer can see what they let go and reselect if needed (C8).
    # File-selection reviews only — a git_diff's file set is defined by the diff.
    removed = for a <- review.artifacts, not is_nil(a.removed_at), do: a

    active_entries =
      review
      |> expand(paths)
      |> Enum.map(&file_entry(&1, Map.get(active, &1), file_content_hash(review, &1), nil, nil))

    removed_entries = Enum.map(removed, &soft_removed_entry/1)
    active_entries ++ removed_entries
  end

  def list_files(%Review{source: %GitDiff{}} = review), do: list_files(review, %{})

  @doc """
  Lists a diff review's files under a live lens (BDR-0024): the reviewer's
  current `scope` (`:all` or `{:commits, [sha, ...]}`) and `worktree`
  (`:diff`, `:staged`, `:unstaged`) choice. Default lens (`%{}`) matches the
  pinned `base_ref...head_ref` diff exactly like `list_files/1`, so callers
  that do not care about the lens see no behaviour change. A single-element
  `commits` list scopes to that commit's own patch; a longer list narrows to
  the range spanning them (newest first per `list_diff_commits/1`). A
  file-selection review ignores the lens.

  ## Examples

      Suikou.Reviews.list_files(diff_review, %{worktree: :staged})
      #=> [%{path: "a.txt", change_status: :modified, ...}]

      Suikou.Reviews.list_files(diff_review, %{scope: {:commits, [sha]}})
      #=> [%{path: "a.txt", change_status: :modified, ...}]

  """
  @spec list_files(Review.t(), lens()) :: [file_entry()]
  def list_files(%Review{source: %FileSelection{}} = review, _lens), do: list_files(review)

  def list_files(%Review{source: %GitDiff{} = git_diff} = review, lens)
      when is_map(lens) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}
    lens = normalize_lens(review, lens)

    case lens_changed_with_status(review.project_path, git_diff, lens) do
      {:ok, entries} ->
        sorted = Enum.sort_by(entries, & &1.path)
        paths = Enum.map(sorted, & &1.path)
        {blobs, stats} = lens_blobs_and_stats(review.project_path, git_diff, lens, paths)

        Enum.map(sorted, fn %{path: path, status: status} ->
          file_entry(
            path,
            Map.get(active, path),
            Map.get(blobs, path),
            status,
            Map.get(stats, path)
          )
        end)

      {:error, _reason} ->
        []
    end
  end

  @typep file_entry() :: %{
           path: String.t(),
           artifact_id: Ecto.UUID.t() | nil,
           content_hash: String.t() | nil,
           change_status: Git.change_status() | nil,
           added: non_neg_integer() | nil,
           deleted: non_neg_integer() | nil,
           soft_removed: boolean()
         }

  defp file_entry(path, artifact, content_hash, change_status, stats) do
    {added, deleted} = split_stats(stats)

    %{
      path: path,
      artifact_id: artifact && artifact.id,
      content_hash: content_hash,
      change_status: change_status,
      added: added,
      deleted: deleted,
      soft_removed: false
    }
  end

  defp soft_removed_entry(%Artifact{} = artifact) do
    artifact.file_path
    |> file_entry(artifact, nil, nil, nil)
    |> Map.put(:soft_removed, true)
  end

  defp split_stats(nil), do: {nil, nil}
  defp split_stats(%{added: added, deleted: deleted}), do: {added, deleted}

  @type content_source() ::
          {:file, String.t()} | {:inline, binary(), String.t()}
  @typedoc """
  Per-request live-lens overlay for a git-diff review (BDR-0024). Callers may
  pass `%{}` to keep the default `base_ref...head_ref` diff — the same output
  as the pre-lens API — or set `:scope` and/or `:worktree` to switch the
  diff source at request time without changing the review row. `:scope`
  carries the reviewer's commit-range selection: `:all` (or an empty commits
  list, normalized to `:all`) keeps the full range; a `{:commits, shas}` tuple
  narrows to those commits (newest first per `list_diff_commits/1`) — one sha
  is a single commit's patch, two or more span a sub-range.
  """
  @type lens() :: %{
          optional(:scope) => :all | {:commits, [String.t()]},
          optional(:worktree) => :diff | :staged | :unstaged
        }
  @type content_by_path_error() ::
          :path_not_in_review
          | :unsafe_path
          | :not_a_file
          | :not_a_git_repo
          | :git_error
          | :not_changed
          | :commit_not_in_range
          | :invalid_scope_worktree_combination
  @type raw_by_path_error() ::
          :path_not_in_review
          | :unsafe_path
          | :not_a_file
          | :not_a_git_repo
          | :git_error

  @doc """
  Returns how to serve the live content for `path` inside `review` without
  minting an artifact, dispatched by review source: a file-selection review
  answers `{:file, absolute_path}` so the caller can `send_file`; a git-diff
  review answers `{:inline, diff_text, "text/x-diff"}` with the live diff
  re-run from git. Mirrors `Suikou.Artifacts.content_source/1`'s contract so
  the controller can render either branch the same way.

  Security: `path` is whitelisted against the review's current `list_files/1`
  set. Anything outside that set (arbitrary filesystem path, `../` traversal,
  unrelated repo entries) is rejected as `:path_not_in_review`.

  ## Examples

      Suikou.Reviews.fetch_content_by_path(review, "docs/plan.md")
      #=> {:ok, {:file, "/projects/app/docs/plan.md"}}

      Suikou.Reviews.fetch_content_by_path(review, "../secret")
      #=> {:error, :path_not_in_review}

  """
  @spec fetch_content_by_path(Review.t(), String.t()) ::
          {:ok, content_source()} | {:error, content_by_path_error()}
  def fetch_content_by_path(%Review{} = review, path) when is_binary(path) do
    fetch_content_by_path(review, path, %{})
  end

  @doc """
  Live-lens variant of `fetch_content_by_path/2` (BDR-0024). `lens` is a map
  with optional `:scope` (`:all` or `{:commits, [sha, ...]}`) and `:worktree`
  (`:diff`, `:staged`, `:unstaged`) keys. The default `%{}` matches
  `fetch_content_by_path/2` exactly.

  Rejects a non-empty `commits` selection paired with `worktree ∈ {:staged,
  :unstaged}` as `:invalid_scope_worktree_combination`, and rejects any sha
  that is not in the review's `base_ref...head_ref` range as
  `:commit_not_in_range`. File-selection reviews ignore the lens.

  ## Examples

      Suikou.Reviews.fetch_content_by_path(diff_review, "a.txt", %{worktree: :staged})
      #=> {:ok, {:inline, "diff --git a/a.txt b/a.txt\\n...", "text/x-diff"}}

  """
  @spec fetch_content_by_path(Review.t(), String.t(), lens()) ::
          {:ok, content_source()} | {:error, content_by_path_error()}
  def fetch_content_by_path(%Review{} = review, path, lens)
      when is_binary(path) and is_map(lens) do
    review = Repo.preload(review, [:project])

    with :ok <- validate_lens(lens),
         :ok <- validate_scope_in_range(review, lens),
         true <- path_in_review?(review, path, lens) do
      read_content_by_path(review, path, normalize_lens(review, lens))
    else
      false -> {:error, :path_not_in_review}
      {:error, reason} -> {:error, reason}
    end
  end

  defp path_in_review?(%Review{} = review, path, lens) do
    Enum.any?(list_files(review, lens), &(&1.path == path))
  end

  defp read_content_by_path(%Review{source: %FileSelection{}} = review, path, _lens) do
    file_selection_content_source(review, path)
  end

  defp read_content_by_path(
         %Review{source: %GitDiff{} = git_diff} = review,
         path,
         lens
       ) do
    case lens_file_diff(review.project_path, git_diff, lens, path) do
      {:ok, ""} -> {:error, :not_changed}
      {:ok, diff} -> {:ok, {:inline, diff, "text/x-diff"}}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  @doc """
  Returns how to serve the raw file bytes for `path` inside `review` without
  minting an artifact: a file-selection review answers `{:file, absolute_path}`
  so the caller can `send_file` (same shape as `fetch_content_by_path/2`); a
  git-diff review answers `{:inline, blob_bytes, content_type}` with the
  file's bytes at the head ref and a media type derived from the path's
  extension. Used by the review surface to preview images and other binary
  files in "all files" mode regardless of review source, where
  `fetch_content_by_path/2` would otherwise return the unified diff text for
  a git-diff review.

  Security: same whitelist as `fetch_content_by_path/2` — `path` must appear
  in `list_files/1`. Anything outside that set is rejected as
  `:path_not_in_review`.

  ## Examples

      Suikou.Reviews.fetch_raw_by_path(review, "img/logo.png")
      #=> {:ok, {:inline, <<...png bytes...>>, "image/png"}}

      Suikou.Reviews.fetch_raw_by_path(review, "../secret")
      #=> {:error, :path_not_in_review}

  """
  @spec fetch_raw_by_path(Review.t(), String.t()) ::
          {:ok, content_source()} | {:error, raw_by_path_error()}
  def fetch_raw_by_path(%Review{} = review, path) when is_binary(path) do
    review = Repo.preload(review, [:project])

    if path_in_review?(review, path, %{}),
      do: read_raw_by_path(review, path),
      else: {:error, :path_not_in_review}
  end

  defp read_raw_by_path(%Review{source: %FileSelection{}} = review, path) do
    file_selection_content_source(review, path)
  end

  defp read_raw_by_path(%Review{source: %GitDiff{} = git_diff} = review, path) do
    case Git.show_blob(review.project_path, git_diff.head_ref, path) do
      {:ok, bytes} -> {:ok, {:inline, bytes, MIME.from_path(path)}}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp file_selection_content_source(%Review{} = review, path) do
    case ReviewRoots.absolute(review, path) do
      {:ok, absolute} ->
        if File.regular?(absolute), do: {:ok, {:file, absolute}}, else: {:error, :not_a_file}

      {:error, :unsafe_path} ->
        {:error, :unsafe_path}
    end
  end

  defp file_content_hash(%Review{} = review, rel_path) do
    with {:ok, absolute} <- ReviewRoots.absolute(review, rel_path),
         true <- File.regular?(absolute),
         {:ok, bytes} <- File.read(absolute) do
      Base.encode16(:crypto.hash(:sha256, bytes))
    else
      _missing_or_unreadable -> nil
    end
  end

  defp head_blob_ids(project_path, %GitDiff{head_ref: head_ref}, paths) do
    case Git.blob_ids(project_path, head_ref, paths) do
      {:ok, map} -> map
      {:error, _reason} -> %{}
    end
  end

  # A selected directory stands for every file beneath it; a selected file is
  # itself. Expansion reads the directory live, so membership is dynamic — files
  # added under a selected directory appear without editing the selection. A
  # selected file is dropped when the project no longer lists it (gitignored or
  # under `.git`), so a stale selection never leaks once the toggle is on.
  defp expand(%Review{} = review, paths) do
    respect = respect_gitignore?(review)

    paths
    |> Enum.flat_map(&expand_path(review, respect, &1))
    |> Enum.uniq()
  end

  # A selected path is expanded under whichever root its marker names, and a
  # scratch expansion re-prefixes the walk's results so every path the review
  # deals in stays review-relative.
  defp expand_path(%Review{} = review, respect, path) do
    case ReviewRoots.locate(review, path) do
      {:ok, base, relative} -> expand_under(base, respect, relative, path)
      {:error, :unsafe_path} -> []
    end
  end

  defp expand_under(base, respect, relative, path) do
    cond do
      File.dir?(Path.join(base, relative)) -> walk_under(base, respect, relative, path)
      Projects.listable?(base, respect, relative) -> [path]
      true -> []
    end
  end

  defp walk_under(base, respect, relative, path) do
    walked = Projects.list_files(base, respect, relative)

    if ReviewRoots.scratch?(path),
      do: Enum.map(walked, &ReviewRoots.scratch_path/1),
      else: walked
  end

  defp broadcast_review_change({:ok, %Review{id: review_id}} = result) do
    Events.review_changed(review_id)
    result
  end

  defp broadcast_review_change({:ok, %Artifact{review_id: review_id}} = result) do
    Events.review_changed(review_id)
    result
  end

  defp broadcast_review_change(result), do: result

  defp mint_or_get(review, path, create_fun) do
    result =
      case find_artifact(review.id, path) do
        %Artifact{removed_at: nil} = artifact -> {:ok, artifact}
        %Artifact{} = artifact -> {:ok, restore!(artifact)}
        nil -> mint(review, path, create_fun)
      end

    broadcast_review_change(result)
  end

  defp mint(review, path, create_fun) do
    case create_fun.(review, path) do
      {:ok, %{artifact: artifact}} -> {:ok, artifact}
      {:error, reason} -> {:error, reason}
    end
  rescue
    # Lost a concurrent-open race: the unique (review_id, file_path) index
    # rejected the second insert. The winner's row already exists.
    Ecto.InvalidChangesetError -> {:ok, find_artifact(review.id, path)}
  end

  defp find_artifact(review_id, path) do
    query =
      from(a in Artifact,
        as: :artifact,
        where: a.review_id == ^review_id and a.file_path == ^path
      )

    Repo.one(query)
  end

  defp reconcile!(artifact, selected) do
    cond do
      selected and not is_nil(artifact.removed_at) -> restore!(artifact)
      not selected and is_nil(artifact.removed_at) -> remove!(artifact)
      true -> :ok
    end
  end

  defp restore!(artifact) do
    artifact |> Artifact.restore_changeset() |> Repo.update!()
  end

  defp remove!(artifact) do
    artifact |> Artifact.remove_changeset(DateTime.utc_now(:second)) |> Repo.update!()
  end

  defp preload_active(reviews) do
    active = from(a in Artifact, where: is_nil(a.removed_at), order_by: [asc: a.file_path])
    Repo.preload(reviews, [:project, artifacts: active])
  end

  defp ensure_git_repo(path) do
    if Git.repo?(path), do: :ok, else: {:error, :not_a_git_repo}
  end

  defp resolve_base_ref(path, params) do
    case Map.get(params, :base_ref) do
      ref when is_binary(ref) and ref != "" ->
        {:ok, ref}

      _missing ->
        case Git.default_branch(path) do
          {:ok, ref} -> {:ok, ref}
          {:error, :not_a_repo} -> {:error, :not_a_git_repo}
        end
    end
  end

  defp fetch_head_ref(params) do
    case Map.get(params, :head_ref) do
      ref when is_binary(ref) and ref != "" -> {:ok, ref}
      _missing -> {:error, :missing_head_ref}
    end
  end

  defp ensure_ref(path, ref, error) do
    if Git.ref_exists?(path, ref), do: :ok, else: {:error, error}
  end

  # Refs/repo are already validated above, so an empty list means a base==head
  # (or otherwise no-change) pair — reject before persisting an empty review. A
  # git failure here is a real error, distinct from "no diff".
  defp ensure_changes(path, base, head) do
    case Git.changed_files(path, base, head) do
      {:ok, []} -> {:error, :no_changes}
      {:ok, [_head | _rest]} -> :ok
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp changed_paths(path, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.changed_files(path, base, head) do
      {:ok, paths} -> {:ok, paths}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp changed_with_status(path, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.changed_files_with_status(path, base, head) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp diff_stats(path, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.diff_stats(path, base, head) do
      {:ok, stats} -> stats
      {:error, _reason} -> %{}
    end
  end

  # Fill in default lens keys so every reader downstream sees a fully-shaped
  # map. Callers may pass a partial lens (`%{}`, `%{worktree: :staged}`, ...)
  # and the defaults keep the pre-BDR-0024 behaviour (pinned base...head
  # diff). An empty `commits` list normalizes to `:all` so downstream match
  # arms don't need to special-case it.
  defp normalize_lens(review, lens) do
    scope =
      case Map.get(lens, :scope, :all) do
        {:commits, []} -> :all
        {:commits, shas} -> {:commits, order_commits(review, shas)}
        other -> other
      end

    worktree = Map.get(lens, :worktree, :diff)
    %{scope: scope, worktree: worktree}
  end

  # Reorder a client-supplied sha selection into `list_diff_commits/1`'s
  # canonical newest-first order. The client tracks click order, not git
  # order, so downstream range/union derivations that assume newest-first
  # (`lens_file_diff`, `lens_changed_with_status`) must not trust it. Falls
  # back to the given order when the canonical list is unavailable.
  defp order_commits(review, shas) do
    case list_diff_commits(review) do
      {:ok, entries} ->
        selected = MapSet.new(shas)
        ordered = for %{sha: sha} <- entries, MapSet.member?(selected, sha), do: sha
        if ordered == [], do: shas, else: ordered

      {:error, _reason} ->
        shas
    end
  end

  defp validate_lens(lens) do
    scope = Map.get(lens, :scope, :all)
    worktree = Map.get(lens, :worktree, :diff)

    if match?({:commits, [_first | _rest]}, scope) and worktree in [:staged, :unstaged] do
      {:error, :invalid_scope_worktree_combination}
    else
      :ok
    end
  end

  defp validate_scope_in_range(%Review{source: %FileSelection{}}, _lens), do: :ok

  defp validate_scope_in_range(%Review{source: %GitDiff{}} = review, lens) do
    case Map.get(lens, :scope, :all) do
      :all ->
        :ok

      {:commits, []} ->
        :ok

      {:commits, shas} when is_list(shas) ->
        commits_in_range(review, shas)
    end
  end

  defp commits_in_range(review, shas) do
    case list_diff_commits(review) do
      {:ok, entries} ->
        known = MapSet.new(entries, & &1.sha)

        if Enum.all?(shas, &MapSet.member?(known, &1)),
          do: :ok,
          else: {:error, :commit_not_in_range}

      {:error, _reason} ->
        {:error, :commit_not_in_range}
    end
  end

  defp lens_changed_with_status(path, git_diff, %{scope: :all, worktree: :diff}) do
    changed_with_status(path, git_diff)
  end

  defp lens_changed_with_status(path, _git_diff, %{
         scope: {:commits, [sha]},
         worktree: :diff
       }) do
    case Git.commit_files(path, sha) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  # A multi-commit selection collapses to the union of every commit's file
  # set — a file that any selected commit touched is in the navigator, and
  # the newer commit's status wins when the same file appears twice.
  # `list_diff_commits/1` orders newest first, so the head is `newest` and
  # the last entry is `oldest`; we walk oldest → newest so newer statuses
  # overwrite. Root-safe because each `commit_files/2` handles the root
  # commit on its own.
  defp lens_changed_with_status(path, _git_diff, %{
         scope: {:commits, [_first | _rest] = shas},
         worktree: :diff
       }) do
    case multi_commit_files(path, Enum.reverse(shas)) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp lens_changed_with_status(path, _git_diff, %{
         scope: :all,
         worktree: :staged
       }) do
    case Git.staged_files(path) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp lens_changed_with_status(path, _git_diff, %{
         scope: :all,
         worktree: :unstaged
       }) do
    case Git.unstaged_files(path) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp lens_blobs_and_stats(path, git_diff, %{scope: :all, worktree: :diff}, paths) do
    {head_blob_ids(path, git_diff, paths), diff_stats(path, git_diff)}
  end

  # Non-default lenses skip cached blob ids + line stats. Content hash is nil
  # (no stable cache key against the live worktree/commit view — the frontend
  # always refetches under a lens); +N/−M chips are omitted for the same
  # reason. These are follow-ups if the reviewer wants them.
  defp lens_blobs_and_stats(_path, _git_diff, _lens, _paths), do: {%{}, %{}}

  # Full-file context so the reviewer can expand every gap client-side; the
  # renderer folds long unchanged runs back down to a GitHub-style default view.
  # ponytail: only the default lens ships full context — commit/staged/unstaged
  # views stay at git's -U3; widen them if reviewers ask.
  defp lens_file_diff(path, git_diff, %{scope: :all, worktree: :diff}, rel_path) do
    Git.file_diff(path, git_diff.base_ref, git_diff.head_ref, rel_path, 1_000_000)
  end

  defp lens_file_diff(
         path,
         _git_diff,
         %{scope: {:commits, [sha]}, worktree: :diff},
         rel_path
       ) do
    Git.commit_file_diff(path, sha, rel_path)
  end

  defp lens_file_diff(
         path,
         _git_diff,
         %{scope: {:commits, [newest | _rest] = shas}, worktree: :diff},
         rel_path
       ) do
    Git.range_diff(path, List.last(shas), newest, rel_path)
  end

  defp lens_file_diff(
         path,
         _git_diff,
         %{scope: :all, worktree: :staged},
         rel_path
       ) do
    Git.staged_file_diff(path, rel_path)
  end

  defp lens_file_diff(
         path,
         _git_diff,
         %{scope: :all, worktree: :unstaged},
         rel_path
       ) do
    Git.unstaged_file_diff(path, rel_path)
  end

  # Walk `shas` (oldest → newest) and merge each commit's `commit_files/2`
  # entries into a `path => status` map so a later commit's status wins.
  # Bails on the first git error. The caller keeps ordering (the sorted list
  # in `list_files/2` sorts by path anyway).
  defp multi_commit_files(path, shas) do
    result = Enum.reduce_while(shas, {:ok, %{}}, &merge_commit_files(path, &1, &2))

    case result do
      {:ok, map} -> {:ok, for({p, s} <- map, do: %{path: p, status: s})}
      {:error, reason} -> {:error, reason}
    end
  end

  defp merge_commit_files(path, sha, {:ok, acc}) do
    case Git.commit_files(path, sha) do
      {:ok, entries} ->
        {:cont, {:ok, Enum.into(entries, acc, fn %{path: p, status: s} -> {p, s} end)}}

      {:error, reason} ->
        {:halt, {:error, reason}}
    end
  end
end
