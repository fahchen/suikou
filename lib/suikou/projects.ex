defmodule Suikou.Projects do
  @moduledoc """
  Project boards: a project is a named board reviews are filed under, plus the
  repository `identity` those reviews are about. It is never a location — the
  checkout a review reads from lives on the review (see `Suikou.ReviewRoots`).

  Identity is what lets a review created from any worktree of one repository
  land in one project without the agent arranging it. The directory-walking
  helpers here take a base path rather than a project, so the same walk serves
  both a review's checkout and its scratch root.

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Git
  alias Suikou.Repo
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review

  @doc """
  Registers a project. `path` is evidence of *which repository*, not storage:
  it is resolved to an identity and then discarded, so later reviews from any
  worktree of that repository group here. Omit it for a board holding reviews
  from unrelated directories, which simply carries no identity.

  Returns `{:error, :not_a_directory}` when a given path does not point at an
  existing directory, `{:error, :not_a_repository}` when it points at one that
  is not a git working tree — a project registered from it could never be found
  again by a checkout, since lookup goes through repository identity — and a
  changeset error carrying `:identity` when another project already claims that
  repository.

  ## Examples

      Suikou.Projects.register_project(%{name: "Suikou", path: "./"})
      #=> {:ok, %Suikou.Schemas.Project{name: "Suikou", identity: "github.com/fahchen/suikou"}}

      Suikou.Projects.register_project(%{name: "Docs", path: "./nope"})
      #=> {:error, :not_a_directory}

  """
  @spec register_project(map()) ::
          {:ok, Project.t()}
          | {:error, :not_a_directory | :not_a_repository | Ecto.Changeset.t()}
  def register_project(params) do
    changeset = Project.create_changeset(params)

    with {:ok, identity} <- resolve_identity(Map.get(params, :path)),
         true <- changeset.valid? do
      changeset
      |> Ecto.Changeset.put_change(:identity, identity)
      |> Repo.insert()
    else
      false -> {:error, changeset}
      {:error, reason} -> {:error, reason}
    end
  end

  defp resolve_identity(nil), do: {:ok, nil}

  defp resolve_identity(path) do
    expanded = Path.expand(path)

    cond do
      not File.dir?(expanded) -> {:error, :not_a_directory}
      identity = Git.identity(expanded) -> {:ok, identity}
      true -> {:error, :not_a_repository}
    end
  end

  @doc """
  Fetches the project that groups the repository `dir` belongs to, or `nil`
  when `dir` is not a repository or no project claims it. This is how a review
  created from a fresh worktree finds the project its siblings already live in.

  ## Examples

      Suikou.Projects.get_project_by_dir("/projects/app")
      #=> %Suikou.Schemas.Project{identity: "github.com/fahchen/suikou"}

      Suikou.Projects.get_project_by_dir("/tmp")
      #=> nil

  """
  @spec get_project_by_dir(String.t()) :: Project.t() | nil
  def get_project_by_dir(dir) do
    expanded = Path.expand(dir)

    case Git.identity(expanded) do
      nil -> nil
      identity -> Repo.get_by(Project, identity: identity) || adopt(expanded, identity)
    end
  end

  # A project that predates identity carries none, so nothing would ever match it
  # and its reviews would look like they belong to an unregistered repository.
  # Claim it the first time one of its own reviews' checkouts is resolved: that
  # review is proof this project already reviews this repository. Migrating this
  # way rather than in the migration keeps `git` out of a schema change.
  defp adopt(dir, identity) do
    query =
      from(p in Project,
        as: :project,
        join: r in Review,
        as: :review,
        on: r.project_id == p.id,
        where: is_nil(p.identity) and r.project_path == ^dir,
        order_by: [desc: r.id],
        limit: 1
      )

    case Repo.one(query) do
      nil ->
        nil

      %Project{} = project ->
        case project |> Project.identity_changeset(identity) |> Repo.update() do
          {:ok, %Project{} = adopted} -> adopted
          # Lost a race to another caller claiming the same identity.
          {:error, %Ecto.Changeset{}} -> Repo.get_by(Project, identity: identity)
        end
    end
  end

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
  Updates an existing project's settings — its display `name` and whether it
  respects `.gitignore`. `path` is fixed (see `Project.update_changeset/2`).

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
  Returns the project grouping the repository `dir` belongs to, registering one
  named after the repository when none does yet. An agent creating its first
  review in a repository should not have to stop and ask for a board first —
  the board is bookkeeping, and a name taken from the repository is the name a
  human would have typed anyway. Rename it in the app if not.

  Returns `{:error, :not_a_repository}` when `dir` is not a git working tree,
  because a project registered from it could never be found again by a checkout.

  ## Examples

      Suikou.Projects.project_for_dir("/projects/app")
      #=> {:ok, %Suikou.Schemas.Project{name: "app"}}

      Suikou.Projects.project_for_dir("/tmp")
      #=> {:error, :not_a_repository}

  """
  @spec project_for_dir(String.t()) ::
          {:ok, Project.t()} | {:error, :not_a_repository | Ecto.Changeset.t()}
  def project_for_dir(dir) do
    case get_project_by_dir(dir) do
      %Project{} = project -> {:ok, project}
      nil -> register_project(%{name: repository_name(dir), path: dir})
    end
  end

  # The repository's own name: the last segment of its identity, or of the
  # checkout when it has no remote to take one from.
  defp repository_name(dir) do
    case Git.identity(dir) do
      nil -> dir |> Path.expand() |> Path.basename()
      identity -> identity |> Path.basename() |> String.replace_suffix(".git", "")
    end
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
  Lists the files under `base` as candidate artifacts, relative to `base` and
  sorted. With `rel` it lists only files recursively under that subdirectory;
  the default `""` lists everything. Every file type is reviewable; only the
  preview differs (markdown renders, others are raw-only).

  `base` is a content root — a review's checkout or its scratch directory — so
  one walk serves both. When `respect` is true and a `.gitignore` lives at
  `base`, its patterns filter the result so ignored files are skipped. When it
  is false, every regular file is listed (`.git` is always excluded regardless).
  A scratch root has no `.gitignore`, so the flag costs it nothing.

  ## Examples

      Suikou.Projects.list_files("/projects/app", true)
      #=> ["docs/plan.md", "lib/app.ex", "readme.md"]

      Suikou.Projects.list_files("/projects/app", true, "lib")
      #=> ["lib/app.ex"]

  """
  @spec list_files(String.t(), boolean(), String.t()) :: [String.t()]
  def list_files(path, respect, rel \\ "") do
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
  Answers whether a single relative path is reviewable under `base`: `.git` is
  always excluded, and when `respect` is true a path matched by the root's
  `.gitignore` (directly or via an ignored ancestor directory) is excluded too.
  When `respect` is false, only `.git` is excluded.

  This lets an explicit file selection be filtered by the same gitignore
  decision that directory expansion already respects, so a stale selection (a
  file picked while the toggle was off) never leaks once the toggle is on.

  ## Examples

      Suikou.Projects.listable?("/projects/app", true, "lib/app.ex")
      #=> true

      Suikou.Projects.listable?("/projects/app", true, "secret.txt")
      #=> false

  """
  @spec listable?(String.t(), boolean(), String.t()) :: boolean()
  def listable?(path, respect, rel) do
    cond do
      git_root?(rel) -> false
      respect -> not ignored?(rel, ignore_rules(path), false)
      true -> true
    end
  end

  @doc """
  Lists the immediate children of a subdirectory of `base`, each tagged as a file
  or directory, with directories first then names sorted. Ignored entries are
  skipped. This backs lazy file-tree browsing: a level is read only when opened,
  so a large working directory is never walked in full.

  ## Examples

      Suikou.Projects.list_dir("/projects/app", true, "")
      #=> [%{path: "lib", dir: true}, %{path: "readme.md", dir: false}]

      Suikou.Projects.list_dir("/projects/app", true, "lib")
      #=> [%{path: "lib/app.ex", dir: false}]

  """
  @spec list_dir(String.t(), boolean(), String.t()) :: [%{path: String.t(), dir: boolean()}]
  def list_dir(path, respect, rel) do
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
