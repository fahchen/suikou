defmodule SuikouWeb.AgentCLI.Projects do
  @moduledoc """
  Agent CLI commands for the `project` group: list and create projects. Each
  reads its JSON payload from stdin and emits a JSON result to stdout (see
  `SuikouWeb.AgentCLI`). Writes broadcast on the board topic so an open human
  board reflects the change live.
  """

  alias Suikou.Projects
  alias Suikou.Schemas.Project
  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Stores.BoardBroadcast

  @doc """
  Emits every registered project as `%{projects: [%{id, name, path}]}`.

  ## Examples

      SuikouWeb.AgentCLI.Projects.list()
      #=> :ok  # emits {"projects":[{"id":"0192…","name":"Docs","path":"/tmp/docs"}]}

  """
  @spec list() :: :ok
  def list do
    _payload = AgentCLI.read_payload()
    projects = Enum.map(Projects.list_projects(), &%{id: &1.id, name: &1.name, path: &1.path})
    AgentCLI.emit(%{projects: projects})
  end

  @doc """
  Registers a project from `%{"name", "path"}` and emits `%{project_id}` or
  `%{error}`. Broadcasts the board topic on success.

  ## Examples

      # stdin: {"name": "Docs", "path": "/tmp/docs"}
      SuikouWeb.AgentCLI.Projects.create()
      #=> :ok  # emits {"project_id":"0192…","error":null}

  """
  @spec create() :: :ok
  def create do
    payload = AgentCLI.read_payload()

    reply =
      case Projects.register_project(%{name: payload["name"], path: payload["path"]}) do
        {:ok, %Project{} = project} ->
          BoardBroadcast.broadcast()
          %{project_id: project.id, error: nil}

        {:error, reason} ->
          %{project_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(reply)
  end
end
