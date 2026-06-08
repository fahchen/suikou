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
  Lists a project's markdown files as candidate artifacts, relative to the
  project directory and sorted.

  ## Examples

      Suikou.Projects.list_files(project)
      #=> ["docs/plan.md", "readme.md"]

  """
  @spec list_files(Project.t()) :: [String.t()]
  def list_files(%Project{path: path}) do
    path
    |> Path.join("**/*.md")
    |> Path.wildcard()
    |> Enum.map(&Path.relative_to(&1, path))
    |> Enum.sort()
  end
end
