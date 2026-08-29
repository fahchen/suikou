defmodule Suikou.ReviewRoots do
  @moduledoc """
  Cross-domain path resolution: a review reads from two content roots, and this
  turns a review-relative path into an absolute one under the right root. Like
  `Suikou.Git`, this is shared kernel — open to every context — and it never
  hits `Repo`.

  `project_path` holds the checkout the review reads code from; `scratch_path`
  holds the directory an agent writes generated output into, so a report can be
  reviewed without being committed. A path picks its root with a leading marker
  segment, `@scratch` or `@project`; an unmarked path resolves under
  `project_path`, which is every path that existed before scratch roots did.

  Encoding the root in the path rather than beside it keeps the review-relative
  path the single key everywhere else — the `(review_id, file_path)` unique
  index, the frontend's file entries, comment anchors and export all keep
  treating it as an opaque string.
  """

  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review

  @scratch_marker "@scratch"
  @project_marker "@project"

  @type locate_error() :: :unsafe_path

  @doc """
  Resolves `path` to `{base, relative}` under the review's matching root, with
  `Path.safe_relative/2` run against that base so a `../` chain can never escape
  it. Two sandboxes, never one sandbox with a hole in it.

  ## Examples

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.locate(review, "lib/app.ex")
      {:ok, "/proj", "lib/app.ex"}

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.locate(review, "@scratch/report.md")
      {:ok, "/data/r1", "report.md"}

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.locate(review, "../etc/passwd")
      {:error, :unsafe_path}

  """
  @spec locate(Review.t(), String.t()) ::
          {:ok, String.t(), String.t()} | {:error, locate_error()}
  def locate(%Review{} = review, path) when is_binary(path) do
    {base, relative} = split_root(review, path)

    case Path.safe_relative(relative, base) do
      {:ok, safe} -> {:ok, base, safe}
      :error -> {:error, :unsafe_path}
    end
  end

  @doc """
  Resolves `path` to an absolute path under the review's matching root, for the
  callers that only want the joined result.

  ## Examples

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.absolute(review, "@scratch/report.md")
      {:ok, "/data/r1/report.md"}

  """
  @spec absolute(Review.t(), String.t()) :: {:ok, String.t()} | {:error, locate_error()}
  def absolute(%Review{} = review, path) do
    with {:ok, base, relative} <- locate(review, path), do: {:ok, Path.join(base, relative)}
  end

  @doc """
  Answers whether `path` addresses the scratch root, so a caller can keep the
  marker on a path it re-emits after walking a root.

  ## Examples

      iex> Suikou.ReviewRoots.scratch?("@scratch/report.md")
      true

      iex> Suikou.ReviewRoots.scratch?("lib/app.ex")
      false

  """
  @spec scratch?(String.t()) :: boolean()
  def scratch?(path), do: marker(path) == @scratch_marker

  @doc """
  Answers whether `path` names a root outright, so a caller can tell a reference
  that addresses a root from one that is relative to an artifact.

  ## Examples

      iex> Suikou.ReviewRoots.marked?("@project/docs/x.png")
      true

      iex> Suikou.ReviewRoots.marked?("docs/x.png")
      false

  """
  @spec marked?(String.t()) :: boolean()
  def marked?(path), do: marker(path) in [@scratch_marker, @project_marker]

  @doc """
  Prefixes `relative` with the scratch marker, the inverse of `locate/2` for a
  caller that walked the scratch root and must re-emit review-relative paths.

  ## Examples

      iex> Suikou.ReviewRoots.scratch_path("shots/round-3.png")
      "@scratch/shots/round-3.png"

  """
  @spec scratch_path(String.t()) :: String.t()
  def scratch_path(relative), do: Path.join(@scratch_marker, relative)

  @doc """
  Turns an absolute path back into the review-relative form the rest of the
  domain uses, marker and all, or `nil` when it lies under neither root. The
  inverse of `locate/2`, for a file watcher reporting what changed on disk.

  The scratch root is tried first: a review whose scratch directory happens to
  sit inside its checkout would otherwise report scratch files as project files.

  ## Examples

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.relativize(review, "/data/r1/report.md")
      "@scratch/report.md"

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.relativize(review, "/proj/lib/app.ex")
      "lib/app.ex"

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.relativize(review, "/elsewhere/x")
      nil

  """
  @spec relativize(Review.t(), String.t()) :: String.t() | nil
  def relativize(%Review{} = review, abs_path) do
    cond do
      under?(abs_path, review.scratch_path) ->
        scratch_path(Path.relative_to(abs_path, review.scratch_path))

      under?(abs_path, review.project_path) ->
        Path.relative_to(abs_path, review.project_path)

      true ->
        nil
    end
  end

  @doc """
  Lists the roots a review reads from as `{marker_prefix, base}` pairs, so a
  caller walking disk can turn each base's results back into review-relative
  paths.

  ## Examples

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.ReviewRoots.roots(review)
      [{"", "/proj"}, {"@scratch", "/data/r1"}]

  """
  @spec roots(Review.t()) :: [{String.t(), String.t()}]
  def roots(%Review{} = review),
    do: [{"", review.project_path}, {@scratch_marker, review.scratch_path}]

  @doc """
  Expands `path` and resolves any symlinked component, so one directory always
  spells the same way. Without it `/tmp/x` and `/private/tmp/x` are two
  checkouts on macOS, and a review created in the app never matches one created
  from a shell.

  ## Examples

      Suikou.ReviewRoots.canonical("/tmp/project")
      #=> "/private/tmp/project"

  """
  @spec canonical(String.t()) :: String.t()
  def canonical(path) do
    path
    |> Path.expand()
    |> Path.split()
    |> Enum.reduce(&resolve_segment/2)
  end

  # One link hop per component is enough for the case this exists for (a symlinked
  # `/tmp`), and it cannot loop the way full resolution can.
  defp resolve_segment(segment, parent) do
    joined = Path.join(parent, segment)

    case :file.read_link(joined) do
      {:ok, target} -> target |> to_string() |> Path.expand(parent)
      {:error, _reason} -> joined
    end
  end

  @doc """
  Builds the directory a review's generated output lives in:
  `<data dir>/<project identity>/<review id>`. Grouping by the project puts every
  worktree of one repository under one heading; splitting by review id keeps
  concurrent reviews from overwriting each other.

  The identity becomes **one directory**, not a tree: it is trimmed to the parts
  that name a repository to a human and joined with `_`, so
  `github.com/fahchen/suikou` reads as `github.com_fahchen_suikou`. The data
  directory is then a flat list a human can scan and delete from, rather than a
  deep mirror with one project per branch of it.

  What is kept:

    * a remote URL keeps its host plus the last two path segments — the owner and
      repository. A nested GitLab group and a port number are dropped as noise:
      `git.example.com:2222/group/sub/app` becomes `git.example.com_sub_app`.
    * a remote-less repository's git directory drops its trailing `.git` and keeps
      the last two path segments, so `/Users/me/work/app/.git` becomes `work_app`
      rather than repeating where the machine happens to keep it.

  This name is for humans, not for identification: `identity` on `projects` is the
  unique key, and every review still lands in its own id-named subdirectory. Two
  repositories can therefore share a directory without a file ever being
  overwritten — for instance two remote-less checkouts at `work/app` under
  different roots. Trimming trades that unlikely case for a name short enough to
  read.

  Within what is kept, `_` marks a separator and `-` marks a character the
  filesystem name cannot carry, so the sanitising never conflates the two.

  ## Examples

      Suikou.ReviewRoots.scratch_dir(project, "01a043c4-912a-7fb1-989a-41ae053b9693")
      #=> "/home/me/.local/share/suikou/github.com_fahchen_suikou/01a043c4-912a-7fb1-989a-41ae053b9693"

  """
  @spec scratch_dir(Project.t(), Ecto.UUID.t()) :: String.t()
  def scratch_dir(%Project{} = project, review_id) do
    key = project.identity || project.name

    Path.join([data_dir(), slug(key), review_id])
  end

  # Segments that sanitise to nothing, `.` or `..` are dropped, so the name can
  # never climb out of the data directory.
  defp slug(key) do
    key
    |> parts()
    |> Enum.map(&sanitize/1)
    |> Enum.reject(&(&1 in ["", ".", ".."]))
    |> case do
      [] -> "unnamed"
      parts -> Enum.join(parts, "_")
    end
  end

  # An identity that starts at the filesystem root is a remote-less repository's
  # git dir. `.git` says nothing and the leading directories say where the machine
  # keeps it, so keep only the tail that names the checkout.
  defp parts("/" <> _rest = path) do
    path
    |> String.replace_suffix("/.git", "")
    |> split()
    |> Enum.take(-2)
  end

  # Otherwise a normalised remote URL. Keep the host and the owner/repository tail;
  # `:` splits too, so a `host:port` drops its port along with any middle groups.
  defp parts(url) do
    case split(url) do
      [host | [_first | _rest] = tail] -> [host | Enum.take(tail, -2)]
      parts -> parts
    end
  end

  defp split(key), do: String.split(key, ["/", "\\", ":"], trim: true)

  defp sanitize(segment) do
    segment
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9._-]+/, "-")
  end

  defp under?(_abs_path, nil), do: false
  defp under?(_abs_path, ""), do: false

  defp under?(abs_path, base), do: abs_path == base or String.starts_with?(abs_path, base <> "/")

  defp split_root(%Review{} = review, path) do
    case marker(path) do
      @scratch_marker -> {review.scratch_path, strip_marker(path)}
      @project_marker -> {review.project_path, strip_marker(path)}
      _unmarked -> {review.project_path, path}
    end
  end

  defp marker(path) do
    case Path.split(path) do
      [first | _rest] -> first
      [] -> nil
    end
  end

  defp strip_marker(path) do
    case Path.split(path) do
      [_marker] -> "."
      [_marker | rest] -> Path.join(rest)
    end
  end

  # XDG data location, matching the config file's `$XDG_CONFIG_HOME` handling in
  # `config/runtime.exs`. Overridable so the test env writes scratch directories
  # into `tmp/` instead of the developer's real data directory.
  defp data_dir do
    Application.get_env(:suikou, :data_dir) || xdg_data_dir()
  end

  defp xdg_data_dir do
    data_home = System.get_env("XDG_DATA_HOME") || Path.join(System.user_home!(), ".local/share")
    Path.join(data_home, "suikou")
  end
end
