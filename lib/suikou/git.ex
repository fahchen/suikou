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
  @type changed_files_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error
  @type file_diff_error() :: :not_a_repo | :invalid_ref | :ref_not_found | :git_error

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
           run(dir, ["for-each-ref", "--format=%(refname:short)", "--sort=-committerdate", "refs/heads/"]) do
      {:ok, parse_names(out)}
    end
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
      case System.cmd("git", args, cd: dir, stderr_to_stdout: true, env: env()) do
        {out, 0} -> {:ok, out}
        {_out, _code} -> {:error, :git_error}
      end
    else
      {:error, :git_error}
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
