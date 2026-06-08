defmodule Suikou.Artifacts.FileSource do
  @moduledoc """
  Reads artifact content from a file selected under a project (see BDR-0018):
  `create/2` mints an artifact with round 0 in draft state, and `resnapshot/1`
  refreshes a draft round's snapshot after the agent edits the file on disk. The
  relative path is validated so a selection can never escape the project
  directory.
  """

  alias Suikou.Critique
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Round

  @doc """
  Creates an artifact at round 0 from `file_path`, read relative to `project`.

  Returns `{:error, :unsafe_path}` when the path escapes the project,
  `{:error, :not_a_file}` when it is missing or not a regular file, and
  `{:error, :empty_content}` when the file is blank.

  ## Examples

      Suikou.Artifacts.FileSource.create(project, "docs/plan.md")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  @spec create(Project.t(), String.t()) ::
          {:ok, %{artifact: Artifact.t(), round: Round.t()}}
          | {:error, :unsafe_path | :not_a_file | :empty_content | Ecto.Changeset.t()}
  def create(%Project{} = project, file_path) when is_binary(file_path) do
    with {:ok, relative} <- safe_relative(project, file_path),
         {:ok, content} <- read_regular_file(Path.join(project.path, relative)),
         :ok <- ensure_present(content) do
      Repo.transaction(fn -> insert(project, relative, content) end)
    end
  end

  @doc """
  Refreshes a draft round's snapshot by re-reading its artifact's file from disk,
  then re-anchors the round's line-scoped comments against the content change.

  Only the latest (draft) round may be re-snapshotted. Returns
  `{:error, :not_latest_round}` for a superseded round, `{:error, :not_a_file}`
  when the file is missing, and `{:error, :empty_content}` when it is blank.

  ## Examples

      Suikou.Artifacts.FileSource.resnapshot(round.id)
      #=> {:ok, %Suikou.Schemas.Round{number: 1}}

  """
  @spec resnapshot(Ecto.UUID.t()) ::
          {:ok, Round.t()}
          | {:error, :round_not_found | :not_latest_round | :not_a_file | :empty_content}
  def resnapshot(round_id) do
    with {:ok, round} <- fetch_latest_round(round_id),
         %Artifact{} = artifact <- Repo.preload(Repo.get!(Artifact, round.artifact_id), :project),
         {:ok, content} <- read_regular_file(source_path(artifact)),
         :ok <- ensure_present(content) do
      Repo.transaction(fn -> refresh(round, content) end)
    end
  end

  defp fetch_latest_round(round_id) do
    case Rounds.get(round_id) do
      nil ->
        {:error, :round_not_found}

      %Round{} = round ->
        if Rounds.latest?(round), do: {:ok, round}, else: {:error, :not_latest_round}
    end
  end

  defp source_path(%Artifact{} = artifact),
    do: Path.join(artifact.project.path, artifact.file_path)

  defp refresh(round, content) do
    prev_content = round.content

    round =
      round
      |> Round.resnapshot_changeset(%{content: content, content_hash: hash(content)})
      |> Repo.update!()

    Critique.reanchor_round(round.id, prev_content, content)
    round
  end

  defp safe_relative(project, file_path) do
    case Path.safe_relative(file_path, project.path) do
      {:ok, relative} -> {:ok, relative}
      :error -> {:error, :unsafe_path}
    end
  end

  defp read_regular_file(path) do
    with true <- File.regular?(path),
         {:ok, content} <- File.read(path) do
      {:ok, content}
    else
      _not_regular -> {:error, :not_a_file}
    end
  end

  defp ensure_present(content) do
    if String.trim(content) == "", do: {:error, :empty_content}, else: :ok
  end

  defp insert(project, relative, content) do
    artifact =
      project
      |> Artifact.create_from_file_changeset(%{title: relative, file_path: relative})
      |> Repo.insert!()

    round =
      %{artifact_id: artifact.id, number: 0, content: content, content_hash: hash(content)}
      |> Round.changeset()
      |> Repo.insert!()

    %{artifact: artifact, round: round}
  end

  defp hash(content), do: Base.encode16(:crypto.hash(:sha256, content))
end
