defmodule Suikou.Git do
  @moduledoc """
  Thin shell over the `git` binary for the reviews/artifacts domains. Lives in
  the open shared kernel (alongside `Suikou.Rounds`) so both `Suikou.Reviews`
  and `Suikou.Artifacts` may reach it; carries no `Repo` access.

  Every call goes through `System.cmd/3`, never a shell, with `--` separating
  refs from paths. Refs are rejected before any git call when they begin with
  `-`, so a hostile ref can never be parsed as an option (see BDR-0020).
  """

  @type repo_dir() :: String.t()
  @type ref() :: String.t()
  @type rel_path() :: String.t()

  @type default_branch_error() :: :not_a_repo
  @type list_branches_error() :: :not_a_repo | :git_error
  @type list_remote_branches_error() :: :not_a_repo | :git_error
  @type changed_files_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type file_diff_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type blob_ids_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type show_blob_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type changed_files_with_status_error() ::
          :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type diff_stats_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type list_commits_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type commit_diff_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type commit_files_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type commit_file_diff_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type range_diff_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type worktree_files_error() :: :not_a_repo | :git_error
  @type worktree_file_diff_error() :: :not_a_repo | :git_error
  @type change_status() :: :added | :modified | :deleted | :renamed | :copied | :type_changed
  @type diff_stat() :: %{added: non_neg_integer() | nil, deleted: non_neg_integer() | nil}
  @type commit_entry() :: %{sha: String.t(), subject: String.t()}

  @doc """
  Returns `true` when `dir` is the working tree of a git repository.

  ## Examples

      Suikou.Git.repo?("/projects/app")
      #=> true

  """
  @spec repo?(repo_dir()) :: boolean()
  def repo?(dir) do
    # Compare against `--show-toplevel` so we only accept the repo root itself;
    # otherwise git walks up the parent chain and any directory nested under a
    # repo (e.g. a tmp dir inside the suikou worktree) would report `true`.
    case run(dir, ["rev-parse", "--show-toplevel"]) do
      {:ok, out} -> Path.expand(String.trim(out)) == Path.expand(dir)
      {:error, _reason} -> false
    end
  end

  @doc """
  Resolves `dir` to the working tree root of the repository containing it, or
  to `dir` itself when it is not inside one. A review pins the root rather than
  whatever subdirectory the agent happened to run in, so its paths stay stable.

  ## Examples

      Suikou.Git.toplevel("/projects/app/lib")
      #=> "/projects/app"

      Suikou.Git.toplevel("/tmp")
      #=> "/tmp"

  """
  @spec toplevel(repo_dir()) :: String.t()
  def toplevel(dir) do
    expanded = Path.expand(dir)

    case run(expanded, ["rev-parse", "--show-toplevel"]) do
      {:ok, out} -> out |> String.trim() |> Path.expand()
      {:error, _reason} -> expanded
    end
  end

  @doc """
  Resolves `dir` to the identity of the repository it belongs to, so every
  worktree of one repository answers the same value and can be grouped under one
  project. Returns `nil` when `dir` is not a git working tree.

  The `origin` remote wins when there is one: its URL is normalised so
  `git@github.com:fahchen/suikou.git`, `https://github.com/fahchen/suikou.git`
  and `ssh://git@github.com/fahchen/suikou` all collapse to
  `github.com/fahchen/suikou`, which makes worktrees, clones and a re-clone after
  `rm -rf` agree. Without a remote it falls back to `--git-common-dir` rather
  than `--git-dir`, because a linked worktree reports the *main* repository's
  `.git` there — so remote-less worktrees still agree.

  ## Examples

      Suikou.Git.identity("/projects/app")
      #=> "github.com/fahchen/suikou"

      Suikou.Git.identity("/tmp")
      #=> nil

  """
  @spec identity(repo_dir()) :: String.t() | nil
  def identity(dir) do
    # Deliberately not guarded by `repo?/1`: identity describes the repository,
    # not the directory, so a subdirectory answers the same value — and `repo?/1`
    # compares an expanded path against git's own, which disagree the moment the
    # directory is reached through a symlink (`/tmp` on macOS).
    remote_identity(dir) || common_dir_identity(dir)
  end

  defp remote_identity(dir) do
    case run(dir, ["remote", "get-url", "origin"]) do
      {:ok, out} -> out |> String.trim() |> normalize_remote()
      {:error, _reason} -> nil
    end
  end

  defp normalize_remote(""), do: nil

  defp normalize_remote(url) do
    url
    |> String.replace(~r{^[a-z0-9+.-]+://}i, "")
    |> String.replace(~r{^[^/@]+@}, "")
    |> String.replace(":", "/", global: false)
    |> String.replace_suffix(".git", "")
    |> String.trim_trailing("/")
    |> String.downcase()
    |> case do
      "" -> nil
      identity -> identity
    end
  end

  defp common_dir_identity(dir) do
    case run(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]) do
      {:ok, out} -> out |> String.trim() |> Path.expand()
      {:error, _reason} -> nil
    end
  end

  @doc """
  Resolves the repository's default branch name using the fallback chain
  `origin/HEAD` -> `main` -> `master` -> current `HEAD` (see BDR-0020). The
  fallback ends at the current `HEAD` because a local-first repository may
  have no remote.

  Returns `{:error, :not_a_repo}` when `dir` is not a git working tree.

  ## Examples

      Suikou.Git.default_branch("/projects/app")
      #=> {:ok, "main"}

  """
  @spec default_branch(repo_dir()) :: {:ok, ref()} | {:error, default_branch_error()}
  def default_branch(dir) do
    if repo?(dir),
      do: {:ok, resolve_default_branch(dir)},
      else: {:error, :not_a_repo}
  end

  @doc """
  Lists `dir`'s local branch names sorted by descending commit date so the
  most recently touched branch leads. Used by `ProjectBoardStore` to populate
  a diff-review creation picker (see BDR-0020).

  ## Examples

      Suikou.Git.list_branches("/projects/app")
      #=> {:ok, ["topic", "main"]}

  """
  @spec list_branches(repo_dir()) :: {:ok, [ref()]} | {:error, list_branches_error()}
  def list_branches(dir) do
    with :ok <- ensure_repo(dir),
         {:ok, out} <-
           run(dir, [
             "for-each-ref",
             "--format=%(refname:short)",
             "--sort=-committerdate",
             "refs/heads/"
           ]) do
      {:ok, parse_names(out)}
    end
  end

  @doc """
  Lists `dir`'s `origin` remote-tracking branches (`refs/remotes/origin/*`),
  short-named so they remain usable as refs (e.g. `"origin/main"`), sorted by
  descending commit date. The `origin/HEAD` symref is excluded. Returns
  `{:ok, []}` when no `origin` remote is configured.

  ## Examples

      Suikou.Git.list_remote_branches("/projects/app")
      #=> {:ok, ["origin/main", "origin/topic"]}

  """
  @spec list_remote_branches(repo_dir()) ::
          {:ok, [ref()]} | {:error, list_remote_branches_error()}
  def list_remote_branches(dir) do
    with :ok <- ensure_repo(dir),
         {:ok, out} <-
           run(dir, [
             "for-each-ref",
             "--format=%(refname)",
             "--sort=-committerdate",
             "refs/remotes/origin/"
           ]) do
      {:ok, parse_remote_branches(out)}
    end
  end

  # Filter the `refs/remotes/origin/HEAD` symref (its short form is shown as
  # either `"origin"` or `"origin/HEAD"` depending on git version, so match
  # on the unambiguous full refname) and strip the `refs/remotes/` prefix to
  # leave short names like `"origin/main"`, still usable as refs.
  defp parse_remote_branches(out) do
    out
    |> parse_names()
    |> Enum.reject(&(&1 == "refs/remotes/origin/HEAD"))
    |> Enum.map(&String.replace_prefix(&1, "refs/remotes/", ""))
  end

  @doc """
  Returns `true` when `ref` resolves to a commit in `dir`. Refs that begin
  with `-` are rejected without invoking git so they can never be misread as
  options.

  ## Examples

      Suikou.Git.ref_exists?("/projects/app", "main")
      #=> true

  """
  @spec ref_exists?(repo_dir(), ref()) :: boolean()
  def ref_exists?(dir, ref) do
    case safe_ref(ref) do
      {:ok, ref} ->
        match?({:ok, _out}, run(dir, ["rev-parse", "--verify", "--quiet", ref <> "^{commit}"]))

      :error ->
        false
    end
  end

  @doc """
  Lists the file paths changed between `base` and `head` with three-dot
  merge-base semantics (`git diff base...head`). Paths are repo-relative and
  unsorted (git's output order).

  ## Examples

      Suikou.Git.changed_files("/projects/app", "main", "topic")
      #=> {:ok, ["lib/app.ex", "test/app_test.exs"]}

  """
  @spec changed_files(repo_dir(), ref(), ref()) ::
          {:ok, [rel_path()]} | {:error, changed_files_error()}
  def changed_files(dir, base, head) do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head),
         {:ok, out} <- run(dir, ["diff", "--name-only", base <> "..." <> head, "--"]) do
      {:ok, parse_names(out)}
    end
  end

  @doc """
  Returns the unified diff text for one `path` between `base` and `head`,
  three-dot. Returns an empty string when `path` is unchanged. Paths are
  treated as filenames, not options, by the trailing `--` separator.

  `unified` is the number of context lines around each change (git's `-U`).
  Pass a large value (e.g. `1_000_000`) to emit the whole file as context so
  the reviewer can expand every gap client-side; git clamps it to the file's
  line count, so there is no need to know the length up front.

  ## Examples

      Suikou.Git.file_diff("/projects/app", "main", "topic", "lib/app.ex")
      #=> {:ok, "diff --git a/lib/app.ex b/lib/app.ex\\n..."}

  """
  @spec file_diff(repo_dir(), ref(), ref(), rel_path(), non_neg_integer()) ::
          {:ok, String.t()} | {:error, file_diff_error()}
  def file_diff(dir, base, head, path, unified \\ 3) when is_integer(unified) and unified >= 0 do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head) do
      run(dir, ["diff", "--unified=#{unified}", base <> "..." <> head, "--", path])
    end
  end

  @doc """
  Returns a map of `path => blob_hash` for each `paths` entry that resolves
  to a blob at `ref` (tree-tracked files at that commit). Paths missing at
  `ref` are simply absent from the map — callers treat the absence as
  "no content version" for that row.

  Used by `Suikou.Reviews.list_files/1` to stamp each git-diff file row with
  a stable cache key derived from the head ref. The blob hash changes iff
  the file's bytes at head change.

  ## Examples

      Suikou.Git.blob_ids("/projects/app", "topic", ["lib/app.ex"])
      #=> {:ok, %{"lib/app.ex" => "0a1b2c..."}}

      Suikou.Git.blob_ids("/projects/app", "topic", [])
      #=> {:ok, %{}}

  """
  @spec blob_ids(repo_dir(), ref(), [rel_path()]) ::
          {:ok, %{rel_path() => String.t()}} | {:error, blob_ids_error()}
  def blob_ids(_dir, _ref, []), do: {:ok, %{}}

  def blob_ids(dir, ref, paths) when is_list(paths) do
    with {:ok, ref} <- tag_invalid_ref(safe_ref(ref)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, ref),
         {:ok, out} <- run(dir, ["ls-tree", "-r", "-z", ref, "--" | paths]) do
      {:ok, parse_ls_tree(out)}
    end
  end

  @doc """
  Reads `path`'s blob bytes at `ref` from `dir` — the on-disk file as committed
  at that ref, regardless of the current working tree. Used by the review's
  by-path raw endpoint so an image at a git-diff review's head ref can be
  previewed without minting an artifact. Returns `{:error, :git_error}` when
  `path` is absent at `ref` (e.g. deleted file, untracked path).

  ## Examples

      Suikou.Git.show_blob("/projects/app", "main", "img/logo.png")
      #=> {:ok, <<...png bytes...>>}

      Suikou.Git.show_blob("/projects/app", "main", "missing")
      #=> {:error, :git_error}

  """
  @spec show_blob(repo_dir(), ref(), rel_path()) ::
          {:ok, binary()} | {:error, show_blob_error()}
  def show_blob(dir, ref, path) when is_binary(path) do
    with {:ok, ref} <- tag_invalid_ref(safe_ref(ref)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, ref) do
      run(dir, ["cat-file", "blob", ref <> ":" <> path])
    end
  end

  @doc """
  Lists files changed between `base` and `head` with three-dot semantics, each
  tagged with its modification kind. Statuses map from git's name-status
  letters: `A`→`:added`, `M`→`:modified`, `D`→`:deleted`, `R*`→`:renamed`,
  `C*`→`:copied`, `T`→`:type_changed`. Renames/copies surface only the new
  path (sibling to `changed_files/3`'s output). Other letters (unmerged, etc.)
  collapse to `:modified`.

  ## Examples

      Suikou.Git.changed_files_with_status("/projects/app", "main", "topic")
      #=> {:ok, [%{path: "a.txt", status: :modified}, %{path: "b.txt", status: :added}]}

  """
  @spec changed_files_with_status(repo_dir(), ref(), ref()) ::
          {:ok, [%{path: rel_path(), status: change_status()}]}
          | {:error, changed_files_with_status_error()}
  def changed_files_with_status(dir, base, head) do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head),
         {:ok, out} <-
           run(dir, ["diff", "--name-status", "-z", base <> "..." <> head, "--"]) do
      {:ok, parse_name_status(out)}
    end
  end

  defp parse_name_status(out) do
    out
    |> String.split(<<0>>, trim: true)
    |> walk_name_status([])
  end

  defp walk_name_status([], acc), do: Enum.reverse(acc)

  defp walk_name_status([status, _old, new | rest], acc)
       when binary_part(status, 0, 1) in ["R", "C"] do
    walk_name_status(rest, [%{path: new, status: status_atom(status)} | acc])
  end

  defp walk_name_status([status, path | rest], acc) do
    walk_name_status(rest, [%{path: path, status: status_atom(status)} | acc])
  end

  @doc """
  Per-file added/deleted line counts between `base` and `head` (three-dot
  semantics), keyed by the file's current-side path. Binary files surface as
  `%{added: nil, deleted: nil}` since git reports `-` line counts for them.
  Powers the diff review navigator's `+N / −M` chips alongside
  `changed_files_with_status/3`.

  ## Examples

      Suikou.Git.diff_stats("/projects/app", "main", "topic")
      #=> {:ok, %{"a.txt" => %{added: 24, deleted: 6}, "logo.png" => %{added: nil, deleted: nil}}}

  """
  @spec diff_stats(repo_dir(), ref(), ref()) ::
          {:ok, %{rel_path() => diff_stat()}} | {:error, diff_stats_error()}
  def diff_stats(dir, base, head) do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head),
         {:ok, out} <-
           run(dir, ["diff", "--numstat", "-z", base <> "..." <> head, "--"]) do
      {:ok, parse_numstat(out)}
    end
  end

  # `git diff --numstat -z` emits `added\tdeleted\tpath\0` for non-renames and
  # `added\tdeleted\t\0oldpath\0newpath\0` for renames/copies. Splitting on NUL
  # first, an entry whose third tab-separated field is empty marks a rename and
  # the next two NUL-separated tokens carry old/new paths.
  defp parse_numstat(out) do
    out
    |> String.split(<<0>>, trim: true)
    |> walk_numstat(%{})
  end

  defp walk_numstat([], acc), do: acc

  defp walk_numstat([head | rest], acc) do
    case String.split(head, "\t", parts: 3) do
      [added, deleted, ""] ->
        case rest do
          [_old, new | tail] ->
            walk_numstat(tail, Map.put(acc, new, numstat_entry(added, deleted)))

          _short ->
            acc
        end

      [added, deleted, path] ->
        walk_numstat(rest, Map.put(acc, path, numstat_entry(added, deleted)))

      _other ->
        walk_numstat(rest, acc)
    end
  end

  defp numstat_entry(added, deleted),
    do: %{added: parse_stat_count(added), deleted: parse_stat_count(deleted)}

  defp parse_stat_count("-"), do: nil

  defp parse_stat_count(count) do
    case Integer.parse(count) do
      {value, ""} -> value
      _other -> nil
    end
  end

  defp status_atom("A"), do: :added
  defp status_atom("M"), do: :modified
  defp status_atom("D"), do: :deleted
  defp status_atom("T"), do: :type_changed
  defp status_atom("R" <> _rest), do: :renamed
  defp status_atom("C" <> _rest), do: :copied
  defp status_atom(_other), do: :modified

  @doc """
  Lists commits reachable from `head` but not from `base` (three-dot semantics,
  `git log base...head`), most recent first. Each entry carries the full SHA
  and the commit subject line. Powers the future commit-by-commit navigation
  axis for diff reviews (see Phase P4 diff-review requirements 2026-07-10).
  Returns `{:ok, []}` when `base` and `head` point at the same commit.

  ## Examples

      Suikou.Git.list_commits("/projects/app", "main", "topic")
      #=> {:ok, [%{sha: "0a1b...", subject: "second"}, %{sha: "9f8e...", subject: "first"}]}

  """
  @spec list_commits(repo_dir(), ref(), ref()) ::
          {:ok, [commit_entry()]} | {:error, list_commits_error()}
  def list_commits(dir, base, head) do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head),
         {:ok, out} <-
           run(dir, [
             "log",
             "--format=%H%x00%s",
             "-z",
             base <> "..." <> head
           ]) do
      {:ok, parse_commit_log(out)}
    end
  end

  @doc """
  Returns the unified diff text introduced by a single `sha` (commit vs. its
  first parent). Root commits diff against the empty tree, so their full
  contents show up as additions. Powers the future per-commit navigation
  axis for diff reviews, where the reviewer walks one commit at a time
  instead of the whole `base...head` range.

  ## Examples

      Suikou.Git.commit_diff("/projects/app", "0a1b2c3")
      #=> {:ok, "diff --git a/lib/app.ex b/lib/app.ex\\n..."}

  """
  @spec commit_diff(repo_dir(), ref()) ::
          {:ok, String.t()} | {:error, commit_diff_error()}
  def commit_diff(dir, sha) do
    with {:ok, sha} <- tag_invalid_ref(safe_ref(sha)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, sha) do
      run(dir, ["show", "--format=", "--patch", sha, "--"])
    end
  end

  @doc """
  Lists files changed by a single `sha` (commit vs. its first parent) with
  name-status letters mapped as in `changed_files_with_status/3`. Root
  commits diff against the empty tree, so every path surfaces as `:added`.
  Powers the per-commit lens's navigator when the reviewer picks a single
  commit from the commit-range popover (BDR-0024).

  ## Examples

      Suikou.Git.commit_files("/projects/app", "0a1b2c3")
      #=> {:ok, [%{path: "a.txt", status: :modified}]}

  """
  @spec commit_files(repo_dir(), ref()) ::
          {:ok, [%{path: rel_path(), status: change_status()}]}
          | {:error, commit_files_error()}
  def commit_files(dir, sha) do
    with {:ok, sha} <- tag_invalid_ref(safe_ref(sha)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, sha),
         {:ok, out} <-
           run(dir, [
             "show",
             "--format=",
             "--name-status",
             "-z",
             sha,
             "--"
           ]) do
      {:ok, parse_name_status(out)}
    end
  end

  @doc """
  Returns the unified diff a single `sha` introduces for one `path` (commit
  vs. its first parent). Powers the per-commit lens's file-content route so
  the reviewer sees exactly what that commit changed in that file, instead
  of the aggregate `base...head` diff. Empty string when `path` is unchanged
  by the commit.

  ## Examples

      Suikou.Git.commit_file_diff("/projects/app", "0a1b2c3", "a.txt")
      #=> {:ok, "diff --git a/a.txt b/a.txt\\n..."}

  """
  @spec commit_file_diff(repo_dir(), ref(), rel_path()) ::
          {:ok, String.t()} | {:error, commit_file_diff_error()}
  def commit_file_diff(dir, sha, path) when is_binary(path) do
    with {:ok, sha} <- tag_invalid_ref(safe_ref(sha)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, sha) do
      run(dir, ["show", "--format=", "--patch", "--unified=1000000", sha, "--", path])
    end
  end

  @doc """
  Returns the unified diff for one `path` covering the commit range from
  `oldest` (inclusive) through `newest` (inclusive) — the patches every commit
  between them introduces on that file, collapsed into one diff. Powers the
  per-file view under a multi-commit lens selection, where the reviewer has
  highlighted a slice of the commit-range popover.

  Root-commit safe: when `oldest` has no parent, the range starts from git's
  well-known empty-tree object so the root commit's own additions are
  included. When `oldest == newest` the diff collapses to that single commit's
  patch (delegates to `commit_file_diff/3`). Returns an empty string when
  `path` is unchanged across the range.

  ## Examples

      Suikou.Git.range_diff("/projects/app", "0a1b2c3", "9f8e7d6", "a.txt")
      #=> {:ok, "diff --git a/a.txt b/a.txt\\n..."}

  """
  @spec range_diff(repo_dir(), ref(), ref(), rel_path()) ::
          {:ok, String.t()} | {:error, range_diff_error()}
  def range_diff(dir, oldest, newest, path) when is_binary(path) do
    with {:ok, oldest} <- tag_invalid_ref(safe_ref(oldest)),
         {:ok, newest} <- tag_invalid_ref(safe_ref(newest)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, oldest),
         :ok <- ensure_ref(dir, newest) do
      if oldest == newest do
        commit_file_diff(dir, newest, path)
      else
        base = range_base(dir, oldest)
        run(dir, ["diff", "--unified=1000000", base <> ".." <> newest, "--", path])
      end
    end
  end

  # `<oldest>^` when `oldest` has a parent, otherwise git's well-known empty
  # tree SHA — the same base `git show` uses for root commits, so the range
  # `<empty_tree>..<newest>` walks every change up to and including the root.
  defp range_base(dir, oldest) do
    case run(dir, ["rev-parse", "--verify", "--quiet", oldest <> "^"]) do
      {:ok, _out} -> oldest <> "^"
      {:error, _reason} -> empty_tree_sha()
    end
  end

  # The canonical git empty-tree object hash; every git repository resolves it
  # without needing any commits, so we can diff against it as the "before"
  # side of a root commit.
  defp empty_tree_sha, do: "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

  @doc """
  Lists files with staged changes — the current index against `HEAD`, with
  name-status letters mapped as in `changed_files_with_status/3`. Powers the
  staged working-tree lens's navigator (BDR-0024 §4). Returns `{:ok, []}`
  when the index matches `HEAD`.

  ## Examples

      Suikou.Git.staged_files("/projects/app")
      #=> {:ok, [%{path: "a.txt", status: :modified}]}

  """
  @spec staged_files(repo_dir()) ::
          {:ok, [%{path: rel_path(), status: change_status()}]}
          | {:error, worktree_files_error()}
  def staged_files(dir) do
    with :ok <- ensure_repo(dir),
         {:ok, out} <-
           run(dir, ["diff", "--cached", "--name-status", "-z", "HEAD", "--"]) do
      {:ok, parse_name_status(out)}
    end
  end

  @doc """
  Lists files with unstaged changes — the working tree against the current
  index, with name-status letters mapped as in `changed_files_with_status/3`.
  Powers the unstaged working-tree lens's navigator (BDR-0024 §4). Returns
  `{:ok, []}` when the working tree matches the index.

  ## Examples

      Suikou.Git.unstaged_files("/projects/app")
      #=> {:ok, [%{path: "a.txt", status: :modified}]}

  """
  @spec unstaged_files(repo_dir()) ::
          {:ok, [%{path: rel_path(), status: change_status()}]}
          | {:error, worktree_files_error()}
  def unstaged_files(dir) do
    with :ok <- ensure_repo(dir),
         {:ok, out} <- run(dir, ["diff", "--name-status", "-z", "--"]) do
      {:ok, parse_name_status(out)}
    end
  end

  @doc """
  Returns the unified diff of the current index against `HEAD` for one
  `path` — the "staged" working-tree lens for a diff review (BDR-0024).
  Empty string when `path` has no staged changes.

  ## Examples

      Suikou.Git.staged_file_diff("/projects/app", "a.txt")
      #=> {:ok, "diff --git a/a.txt b/a.txt\\n..."}

  """
  @spec staged_file_diff(repo_dir(), rel_path()) ::
          {:ok, String.t()} | {:error, worktree_file_diff_error()}
  def staged_file_diff(dir, path) when is_binary(path) do
    with :ok <- ensure_repo(dir) do
      run(dir, ["diff", "--unified=1000000", "--cached", "HEAD", "--", path])
    end
  end

  @doc """
  Returns the unified diff of the working tree against the current index for
  one `path` — the "unstaged" working-tree lens for a diff review
  (BDR-0024). Empty string when `path` has no unstaged changes.

  ## Examples

      Suikou.Git.unstaged_file_diff("/projects/app", "a.txt")
      #=> {:ok, "diff --git a/a.txt b/a.txt\\n..."}

  """
  @spec unstaged_file_diff(repo_dir(), rel_path()) ::
          {:ok, String.t()} | {:error, worktree_file_diff_error()}
  def unstaged_file_diff(dir, path) when is_binary(path) do
    with :ok <- ensure_repo(dir) do
      run(dir, ["diff", "--unified=1000000", "--", path])
    end
  end

  # `git log --format=%H%x00%s -z` emits `<sha>\0<subject>\0` per commit. Split
  # on NUL and pair the tokens; a trailing empty tail from the final NUL is
  # dropped by `trim: true`.
  defp parse_commit_log(out) do
    out
    |> String.split(<<0>>, trim: true)
    |> Enum.chunk_every(2, 2, :discard)
    |> Enum.map(fn [sha, subject] -> %{sha: sha, subject: subject} end)
  end

  defp parse_ls_tree(out) do
    out
    |> String.split(<<0>>, trim: true)
    |> Map.new(fn line ->
      [meta, path] = String.split(line, "\t", parts: 2)
      [_mode, _type, object] = String.split(meta, " ", parts: 3)
      {path, object}
    end)
  end

  defp resolve_default_branch(dir) do
    with :error <- from_origin(dir),
         :error <- from_local(dir, "main"),
         :error <- from_local(dir, "master") do
      current_head(dir)
    else
      {:ok, ref} -> ref
    end
  end

  defp from_origin(dir) do
    case run(dir, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]) do
      {:ok, out} ->
        case String.trim(out) do
          "origin/" <> ref when ref != "" -> {:ok, ref}
          _other -> :error
        end

      {:error, _reason} ->
        :error
    end
  end

  defp from_local(dir, ref) do
    case run(dir, ["rev-parse", "--verify", "--quiet", ref <> "^{commit}"]) do
      {:ok, _out} -> {:ok, ref}
      {:error, _reason} -> :error
    end
  end

  defp current_head(dir) do
    case run(dir, ["rev-parse", "--abbrev-ref", "HEAD"]) do
      {:ok, out} -> String.trim(out)
      {:error, _reason} -> "HEAD"
    end
  end

  defp ensure_repo(dir) do
    if repo?(dir), do: :ok, else: {:error, :not_a_repo}
  end

  defp ensure_ref(dir, ref) do
    if ref_exists?(dir, ref), do: :ok, else: {:error, :ref_not_found}
  end

  defp safe_ref(ref) when is_binary(ref) do
    if ref == "" or String.starts_with?(ref, "-"), do: :error, else: {:ok, ref}
  end

  defp safe_ref(_other), do: :error

  defp tag_invalid_ref({:ok, ref}), do: {:ok, ref}
  defp tag_invalid_ref(:error), do: {:error, :invalid_ref}

  defp parse_names(out) do
    String.split(out, "\n", trim: true)
  end

  defp run(dir, args) do
    if File.dir?(dir) do
      # Run `System.cmd` in an unlinked, monitored worker so the git
      # subprocess Port is linked to the worker — not the caller. Inside a
      # `trap_exit` GenServer (e.g. `Musubi.Page.Server`) the Port's normal
      # termination would otherwise leak `{:EXIT, port, :normal}` into the
      # caller's mailbox and crash Musubi 0.8.0's port-unaware exit logger.
      run_in_worker(dir, args)
    else
      {:error, :git_error}
    end
  end

  defp run_in_worker(dir, args) do
    parent = self()
    ref = make_ref()
    cmd_env = env()

    {pid, mon} =
      spawn_monitor(fn ->
        result = System.cmd("git", args, cd: dir, stderr_to_stdout: true, env: cmd_env)
        send(parent, {ref, result})
      end)

    receive do
      {^ref, {out, 0}} ->
        consume_down(mon, pid)
        {:ok, out}

      {^ref, {_out, _code}} ->
        consume_down(mon, pid)
        {:error, :git_error}

      {:DOWN, ^mon, :process, ^pid, _reason} ->
        {:error, :git_error}
    end
  end

  defp consume_down(mon, pid) do
    receive do
      {:DOWN, ^mon, :process, ^pid, _reason} -> :ok
    after
      0 ->
        Process.demonitor(mon, [:flush])
        :ok
    end
  end

  # Exposed (`@doc false`) so tests can assert the neutralized-env contract
  # without going through behavioural fixtures.
  @doc false
  @spec env() :: [{String.t(), String.t() | nil}]
  def env do
    # Neutralize every parent-process env that could redirect git off the
    # `cd:` repo: config sources point at /dev/null, and the GIT_DIR /
    # work-tree / index / object-dir overrides are unset so they can't bypass
    # our repo confinement.
    [
      {"GIT_CONFIG_GLOBAL", "/dev/null"},
      {"GIT_CONFIG_SYSTEM", "/dev/null"},
      {"GIT_DIR", nil},
      {"GIT_WORK_TREE", nil},
      {"GIT_INDEX_FILE", nil},
      {"GIT_OBJECT_DIRECTORY", nil},
      {"GIT_TERMINAL_PROMPT", "0"}
    ]
  end
end
