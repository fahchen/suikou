defmodule Suikou.Projects do
  @moduledoc """
  Project boards: a project is a directory on disk registered for review.
  Scanning a project lists its markdown files as candidate artifacts; the
  reviewer selects one to create an artifact (see `Suikou.Artifacts.create_from_file/2`
  and BDR-0018).

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Project

  @doc """
  Registers a directory as a project, expanding its path to an absolute one.

  Returns `{:error, :not_a_directory}` when the path does not point at an
  existing directory.

  ## Examples

      Suikou.Projects.register_project(%{name: "Docs", path: "./docs"})
      #=> {:ok, %Suikou.Schemas.Project{name: "Docs"}}

      Suikou.Projects.register_project(%{name: "Docs", path: "./nope"})
      #=> {:error, :not_a_directory}

  """
  @spec register_project(map()) ::
          {:ok, Project.t()} | {:error, :not_a_directory | Ecto.Changeset.t()}
  def register_project(params) do
    changeset = Project.create_changeset(expand_path(params))

    cond do
      not changeset.valid? -> {:error, changeset}
      not File.dir?(Ecto.Changeset.get_field(changeset, :path)) -> {:error, :not_a_directory}
      true -> Repo.insert(changeset)
    end
  end

  defp expand_path(%{path: path} = params) when is_binary(path) do
    %{params | path: Path.expand(path)}
  end

  defp expand_path(params), do: params

  @doc """
  Fetches a project by id, or `nil` when none exists.

  ## Examples

      Suikou.Projects.get_project(project.id)
      #=> %Suikou.Schemas.Project{}

      Suikou.Projects.get_project("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get_project(Ecto.UUID.t()) :: Project.t() | nil
  def get_project(project_id), do: Repo.get(Project, project_id)

  @doc """
  Deletes a project by id.

  Returns `{:error, :project_not_found}` when no project exists for the given id.

  ## Examples

      Suikou.Projects.delete_project(project.id)
      #=> {:ok, %Suikou.Schemas.Project{}}

      Suikou.Projects.delete_project("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :project_not_found}

  """
  @spec delete_project(Ecto.UUID.t()) :: {:ok, Project.t()} | {:error, :project_not_found}
  def delete_project(project_id) do
    case get_project(project_id) do
      %Project{} = project -> Repo.delete(project)
      nil -> {:error, :project_not_found}
    end
  end

  @doc """
  Updates an existing project's settings. Only `respect_gitignore` is editable;
  `name` and `path` are fixed (see `Project.update_changeset/2`).

  ## Examples

      Suikou.Projects.update_project(project, %{respect_gitignore: false})
      #=> {:ok, %Suikou.Schemas.Project{respect_gitignore: false}}

  """
  @spec update_project(Project.t(), map()) ::
          {:ok, Project.t()} | {:error, Ecto.Changeset.t()}
  def update_project(%Project{} = project, params) do
    project
    |> Project.update_changeset(params)
    |> Repo.update()
  end

  @doc """
  Lists all projects, ordered by name.

  ## Examples

      Suikou.Projects.list_projects()
      #=> [%Suikou.Schemas.Project{}]

  """
  @spec list_projects() :: [Project.t()]
  def list_projects do
    query = from(p in Project, as: :project, order_by: [asc: p.name])
    Repo.all(query)
  end

  @doc """
  Lists a project's files as candidate artifacts, relative to the project
  directory and sorted. With `rel` it lists only files recursively under that
  subdirectory; the default `""` lists the whole project. Every file type is
  reviewable; only the preview differs (markdown renders, others are raw-only).

  When the project's `respect_gitignore` is true and a `.gitignore` lives at
  the project root, its patterns filter the result so ignored files are
  skipped. When the flag is false, every regular file under the directory is
  listed (`.git` is always excluded regardless of the flag).

  ## Examples

      Suikou.Projects.list_files(project)
      #=> ["docs/plan.md", "lib/app.ex", "readme.md"]

      Suikou.Projects.list_files(project, "lib")
      #=> ["lib/app.ex"]

  """
  @spec list_files(Project.t(), String.t()) :: [String.t()]
  def list_files(%Project{path: path, respect_gitignore: respect}, rel \\ "") do
    if git_root?(rel) do
      []
    else
      rules = if respect, do: ignore_rules(path), else: []

      path
      |> walk(rel, rules)
      |> Enum.sort()
    end
  end

  @doc """
  Answers whether a single relative path is reviewable for a project: `.git` is
  always excluded, and when `respect_gitignore` is true a path matched by the
  project's `.gitignore` (directly or via an ignored ancestor directory) is
  excluded too. When `respect_gitignore` is false, only `.git` is excluded.

  This lets an explicit file selection be filtered by the same gitignore
  decision that directory expansion already respects, so a stale selection (a
  file picked while the toggle was off) never leaks once the toggle is on.

  ## Examples

      Suikou.Projects.listable?(project, "lib/app.ex")
      #=> true

      Suikou.Projects.listable?(project, "secret.txt")
      #=> false

  """
  @spec listable?(Project.t(), String.t()) :: boolean()
  def listable?(%Project{path: path, respect_gitignore: respect}, rel) do
    cond do
      git_root?(rel) -> false
      respect -> not ignored?(rel, ignore_rules(path), false)
      true -> true
    end
  end

  @doc """
  Lists the immediate children of a project subdirectory, each tagged as a file
  or directory, with directories first then names sorted. Ignored entries are
  skipped. This backs lazy file-tree browsing: a level is read only when opened,
  so a large working directory is never walked in full.

  ## Examples

      Suikou.Projects.list_dir(project, "")
      #=> [%{path: "lib", dir: true}, %{path: "readme.md", dir: false}]

      Suikou.Projects.list_dir(project, "lib")
      #=> [%{path: "lib/app.ex", dir: false}]

  """
  @spec list_dir(Project.t(), String.t()) :: [%{path: String.t(), dir: boolean()}]
  def list_dir(%Project{path: path, respect_gitignore: respect}, rel) do
    if git_root?(rel), do: [], else: read_dir(path, rel, respect)
  end

  defp read_dir(path, rel, respect) do
    rules = if respect, do: ignore_rules(path), else: []
    dir = if rel == "", do: path, else: Path.join(path, rel)

    case File.ls(dir) do
      {:ok, entries} ->
        entries
        |> Enum.flat_map(&dir_entry(path, rel, &1, rules))
        |> Enum.sort_by(fn %{path: p, dir: d} -> {not d, p} end)

      {:error, _reason} ->
        []
    end
  end

  # `.git` is never reviewable, so reject it as an explicit root regardless of
  # `respect_gitignore` — the child-entry exclusion only fires during a walk.
  defp git_root?(rel) do
    normalized = String.replace(rel, "\\", "/")
    normalized == ".git" or String.starts_with?(normalized, ".git/")
  end

  defp dir_entry(_root, _rel, ".git", _rules), do: []

  defp dir_entry(root, rel, entry, rules) do
    child = if rel == "", do: entry, else: rel <> "/" <> entry
    abs = Path.join(root, child)

    cond do
      File.dir?(abs) ->
        if ignored?(child, rules, true), do: [], else: [%{path: child, dir: true}]

      File.regular?(abs) ->
        if ignored?(child, rules, false), do: [], else: [%{path: child, dir: false}]

      true ->
        []
    end
  end

  # Depth-first walk that prunes ignored directories before descending, so the
  # scan never pays to walk `node_modules`, `_build`, or `deps` on a large repo.
  # Git itself never enters an ignored directory, so a file a negation rule
  # would re-include under a pruned directory stays excluded. Only `.git` is
  # excluded unconditionally (git never tracks it and it is never gitignored);
  # every other entry is judged solely by the project's `.gitignore`.
  defp walk(root, rel, rules) do
    dir = if rel == "", do: root, else: Path.join(root, rel)

    case File.ls(dir) do
      {:ok, entries} -> Enum.flat_map(entries, &walk_entry(root, rel, &1, rules))
      {:error, _reason} -> []
    end
  end

  defp walk_entry(_root, _rel, ".git", _rules), do: []

  defp walk_entry(root, rel, entry, rules) do
    child = if rel == "", do: entry, else: rel <> "/" <> entry
    abs = Path.join(root, child)

    cond do
      File.dir?(abs) -> if ignored?(child, rules, true), do: [], else: walk(root, child, rules)
      File.regular?(abs) -> if ignored?(child, rules, false), do: [], else: [child]
      true -> []
    end
  end

  defp ignore_rules(dir) do
    case File.read(Path.join(dir, ".gitignore")) do
      {:ok, content} ->
        content
        |> String.split("\n")
        |> Enum.map(&String.trim_trailing/1)
        |> Enum.reject(&(&1 == "" or String.starts_with?(&1, "#")))
        |> Enum.map(&compile_rule/1)

      {:error, _reason} ->
        []
    end
  end

  defp compile_rule(line) do
    {negated, line} =
      case line do
        "!" <> rest -> {true, rest}
        _unnegated -> {false, line}
      end

    dir_only = String.ends_with?(line, "/")
    body = line |> String.trim_trailing("/") |> String.trim_leading("/")
    anchored = String.starts_with?(line, "/") or String.contains?(body, "/")

    %{negated: negated, dir_only: dir_only, regex: glob_to_regex(body, anchored)}
  end

  defp glob_to_regex(body, anchored) do
    core =
      body
      |> Regex.escape()
      |> String.replace("\\*\\*", ".*")
      |> String.replace("\\*", "[^/]*")
      |> String.replace("\\?", "[^/]")

    prefix = if anchored, do: "^", else: "(?:^|.*/)"
    Regex.compile!(prefix <> core <> "$")
  end

  # A path is ignored when the last matching rule is not a negation. Directory
  # rules are tested against ancestor segments only, so they sweep in contents;
  # `dir?` marks whether the path itself is a directory so a dir-only rule can
  # match the path's own last segment.
  defp ignored?(path, rules, dir?) do
    prefixes = path_prefixes(path, dir?)

    Enum.reduce(rules, false, fn rule, ignored ->
      if rule_matches?(rule, prefixes), do: not rule.negated, else: ignored
    end)
  end

  defp path_prefixes(path, last_is_dir) do
    segments = String.split(path, "/")
    last = length(segments)

    for i <- 1..last do
      {segments |> Enum.take(i) |> Enum.join("/"), i < last or last_is_dir}
    end
  end

  defp rule_matches?(rule, prefixes) do
    candidates =
      if rule.dir_only,
        do: Enum.filter(prefixes, fn {_prefix, dir?} -> dir? end),
        else: prefixes

    Enum.any?(candidates, fn {prefix, _dir?} -> Regex.match?(rule.regex, prefix) end)
  end
end
