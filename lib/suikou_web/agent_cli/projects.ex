defmodule SuikouWeb.AgentCLI.Projects do
  @moduledoc """
  Agent CLI commands for the `project` group: list and create projects. Each
  reads its JSON payload from stdin and emits a JSON result to stdout (see
  `SuikouWeb.AgentCLI`). Writes broadcast on the board topic so an open human
  board reflects the change live.
  """

  alias Suikou.Projects
  alias Suikou.Schemas.Project
  alias Suikou.Settings
  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Stores.BoardBroadcast

  @doc """
  Emits every registered project as
  `%{projects: [%{id, name, identity, respect_gitignore, instructions}]}`.
  `identity` is the repository a project groups, or `null` for a board made by
  hand; a project has no path of its own, since the checkout lives on each
  review.

  `instructions` is the merged review guidance the agent must follow for that
  project (see `Suikou.Settings.instructions_for/1`), empty when the human wrote
  none.

  ## Examples

      SuikouWeb.AgentCLI.Projects.list()
      #=> :ok  # emits {"projects":[{"id":"0192…","name":"Docs","identity":null,"respect_gitignore":true,"instructions":["Reply in English."]}]}

  """
  @spec list() :: :ok
  def list do
    _payload = AgentCLI.read_payload()

    projects = Enum.map(Projects.list_projects(), &project_summary/1)

    AgentCLI.emit(%{projects: projects})
  end

  defp project_summary(%Project{} = project) do
    %{
      id: project.id,
      name: project.name,
      identity: project.identity,
      respect_gitignore: project.respect_gitignore,
      instructions: Settings.instructions_for(project)
    }
  end

  @doc """
  Registers a project from `%{"name", "path", "respect_gitignore"}` and emits
  `%{project_id}` or `%{error}`. `path` is evidence of which repository, not
  storage: it is resolved to an identity and discarded, so later reviews from any
  worktree of that repository group here. `respect_gitignore` is optional — when
  omitted the DB default (true) keeps gitignore filtering on. Broadcasts the
  board topic on success.

  ## Examples

      # stdin: {"name": "Docs", "path": "/tmp/docs", "respect_gitignore": false}
      SuikouWeb.AgentCLI.Projects.create()
      #=> :ok  # emits {"project_id":"0192…","error":null}

  """
  @spec create() :: :ok
  def create do
    payload = AgentCLI.read_payload()

    params = %{
      name: payload["name"],
      path: payload["path"],
      respect_gitignore: payload["respect_gitignore"]
    }

    reply =
      case Projects.register_project(params) do
        {:ok, %Project{} = project} ->
          BoardBroadcast.broadcast()
          %{project_id: project.id, error: nil}

        {:error, reason} ->
          %{project_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(reply)
  end
end
