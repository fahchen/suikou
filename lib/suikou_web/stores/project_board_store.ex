defmodule SuikouWeb.Stores.ProjectBoardStore do
  @moduledoc """
  Root store backing the project board: the reviewer's entry point before an
  artifact exists.

  Takes no mount params. Renders every registered project with its candidate
  markdown files, each linked to the artifact it has already started (or `nil`
  when the file has not been selected for review yet). The `create_artifact`
  command selects a file under a project — reading round 0 from disk (see
  BDR-0018) — and replies with the new artifact id so the client can mount
  `SuikouWeb.Stores.ReviewStore` against it.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket
  alias Suikou.Artifacts
  alias Suikou.Projects
  alias Suikou.Reads
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project

  state do
    field(
      :projects,
      list(%{
        id: String.t(),
        name: String.t(),
        files:
          list(%{
            path: String.t(),
            artifact_id: String.t() | nil
          })
      })
    )
  end

  command :create_artifact do
    payload do
      field(:project_id, String.t())
      field(:file_path, String.t())
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(_params, socket), do: {:ok, socket}

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(_socket) do
    artifact_ids = artifact_ids_by_file()
    %{projects: Enum.map(Projects.list_projects(), &render_project(&1, artifact_ids))}
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:create_artifact, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> create(project, payload["file_path"])
        nil -> %{artifact_id: nil, error: "project_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  # The render derives entirely from the database; `create_artifact` mutates it
  # without touching assigns, so the resolver would reuse the cached render and
  # push no patch (see docs/musubi-issues.md ISSUE-1). Bump a render-irrelevant
  # assign so another client viewing the board sees the file flip to "started".
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())

  defp create(project, file_path) do
    case Artifacts.create_from_file(project, file_path) do
      {:ok, %{artifact: artifact}} -> %{artifact_id: artifact.id, error: nil}
      {:error, reason} -> %{artifact_id: nil, error: error_message(reason)}
    end
  end

  defp error_message(reason) when is_atom(reason), do: Atom.to_string(reason)
  defp error_message(_changeset), do: "invalid_file"

  defp render_project(%Project{} = project, artifact_ids) do
    %{
      id: project.id,
      name: project.name,
      files: Enum.map(Projects.list_files(project), &render_file(project.id, &1, artifact_ids))
    }
  end

  defp render_file(project_id, path, artifact_ids) do
    %{path: path, artifact_id: Map.get(artifact_ids, {project_id, path})}
  end

  # Maps each {project_id, file_path} to its newest artifact id, so a file the
  # reviewer already started links straight to its review instead of minting a
  # duplicate artifact.
  defp artifact_ids_by_file do
    Reads.list_artifacts()
    |> Enum.reverse()
    |> Map.new(fn %Artifact{} = artifact ->
      {{artifact.project_id, artifact.file_path}, artifact.id}
    end)
  end
end
