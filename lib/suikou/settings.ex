defmodule Suikou.Settings do
  @moduledoc """
  Application-wide settings, stored as a single row.

  Today the row carries the human's global review instructions. `instructions_for/1`
  merges them with a project's own instructions into the list the agent CLI hands
  out: general text first, project text second, so a later entry wins when two
  entries conflict.

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Settings

  @doc """
  Reads the settings row, or an unsaved empty struct when no row exists yet.

  ## Examples

      Suikou.Settings.get_settings()
      #=> %Suikou.Schemas.Settings{review_instructions: "Reply in English."}

  """
  @spec get_settings() :: Settings.t()
  def get_settings do
    query = from(s in Settings, as: :settings, limit: 1)
    Repo.one(query) || %Settings{}
  end

  @doc """
  Writes the settings row, inserting it the first time.

  ## Examples

      Suikou.Settings.update_settings(%{review_instructions: "Reply in English."})
      #=> {:ok, %Suikou.Schemas.Settings{review_instructions: "Reply in English."}}

  """
  @spec update_settings(map()) :: {:ok, Settings.t()} | {:error, Ecto.Changeset.t()}
  def update_settings(params) do
    get_settings()
    |> Settings.changeset(params)
    |> Repo.insert_or_update()
  end

  @doc """
  The review instructions an agent working on `project` must follow: the global
  text first, then the project's own. A level with no text contributes nothing,
  so the list is empty when the human wrote neither.

  ## Examples

      Suikou.Settings.instructions_for(project)
      #=> ["Reply in English.", "Report any Repo call inside queries/."]

  """
  @spec instructions_for(Project.t()) :: [String.t()]
  def instructions_for(%Project{review_instructions: project_instructions}) do
    # ponytail: one query per project, so `project list` reads the single-row
    # table once per row. Pass the global text in if a board ever grows big
    # enough for that to matter.
    Enum.reject([get_settings().review_instructions, project_instructions], &is_nil/1)
  end
end
