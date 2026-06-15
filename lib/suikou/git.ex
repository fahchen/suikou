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
  @type rev_parse_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type show_blob_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type changed_files_with_status_error() ::
          :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type change_status() :: :added | :modified | :deleted | :renamed | :copied | :type_changed

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

  ## Examples

      Suikou.Git.file_diff("/projects/app", "main", "topic", "lib/app.ex")
      #=> {:ok, "diff --git a/lib/app.ex b/lib/app.ex\\n..."}

  """
  @spec file_diff(repo_dir(), ref(), ref(), rel_path()) ::
          {:ok, String.t()} | {:error, file_diff_error()}
  def file_diff(dir, base, head, path) do
    with {:ok, base} <- tag_invalid_ref(safe_ref(base)),
         {:ok, head} <- tag_invalid_ref(safe_ref(head)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, base),
         :ok <- ensure_ref(dir, head) do
      run(dir, ["diff", base <> "..." <> head, "--", path])
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

  defp status_atom("A"), do: :added
  defp status_atom("M"), do: :modified
  defp status_atom("D"), do: :deleted
  defp status_atom("T"), do: :type_changed
  defp status_atom("R" <> _rest), do: :renamed
  defp status_atom("C" <> _rest), do: :copied
  defp status_atom(_other), do: :modified

  @doc """
  Resolves `ref` to its current 40-character commit SHA in `dir`. Used by the
  project board to show "this diff currently compares <base_sha>..<head_sha>"
  so a reviewer is not misled when a branch ref advances after the review was
  created. Returns `{:error, :ref_not_found}` when the ref does not resolve to
  a commit.

  ## Examples

      Suikou.Git.rev_parse("/projects/app", "main")
      #=> {:ok, "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b"}

      Suikou.Git.rev_parse("/projects/app", "missing")
      #=> {:error, :ref_not_found}

  """
  @spec rev_parse(repo_dir(), ref()) :: {:ok, String.t()} | {:error, rev_parse_error()}
  def rev_parse(dir, ref) do
    with {:ok, ref} <- tag_invalid_ref(safe_ref(ref)),
         :ok <- ensure_repo(dir),
         :ok <- ensure_ref(dir, ref),
         {:ok, out} <- run(dir, ["rev-parse", "--verify", ref <> "^{commit}"]) do
      {:ok, String.trim(out)}
    end
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
