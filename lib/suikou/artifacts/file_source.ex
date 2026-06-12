defmodule Suikou.Artifacts.FileSource do
  @moduledoc """
  Reads artifact content from a file selected into a review (see BDR-0018):
  `create/2` mints an artifact with round 0 in draft state, and `resnapshot/1`
  refreshes a draft round's snapshot after the agent edits the file on disk. The
  relative path is validated so a selection can never escape the project
  directory.
  """

  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round

  @type create_error() :: :unsafe_path | :not_a_file | :empty_content | Ecto.Changeset.t()

  @doc """
  Creates an artifact at round 0 from `file_path`, read relative to the review's
  project directory. The review must have its `project` preloaded.

  Returns `{:error, :unsafe_path}` when the path escapes the project,
  `{:error, :not_a_file}` when it is missing or not a regular file, and
  `{:error, :empty_content}` when the file is blank.

  ## Examples

      Suikou.Artifacts.FileSource.create(review, "docs/plan.md")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  @spec create(Review.t(), String.t()) ::
          {:ok, %{artifact: Artifact.t(), round: Round.t()}}
          | {:error, create_error()}
  def create(%Review{project: %{path: path}} = review, file_path) when is_binary(file_path) do
    with {:ok, relative} <- safe_relative(path, file_path),
         {:ok, content} <- read_regular_file(Path.join(path, relative)),
         :ok <- ensure_present(content) do
      Repo.transaction(fn -> insert(review, relative, content) end)
    end
  end

  @doc """
  Refreshes a draft round's content hash by re-reading its artifact's file from
  disk. Content is read live rather than stored, so a re-snapshot only updates
  the hash that identifies the revision; comment anchors resolve live at render.

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
         %Artifact{} = artifact <-
           Repo.preload(Repo.get!(Artifact, round.artifact_id), review: :project),
         {:ok, content} <- read_regular_file(source_path(artifact)),
         :ok <- ensure_present(content) do
      {:ok,
       round
       |> Round.resnapshot_changeset(%{content_hash: hash(content)})
       |> Repo.update!()}
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
    do: Path.join(artifact.review.project.path, artifact.file_path)

  defp safe_relative(path, file_path) do
    case Path.safe_relative(file_path, path) do
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

  defp insert(review, relative, content) do
    artifact =
      review
      |> Artifact.create_from_file_changeset(%{title: relative, file_path: relative})
      |> Repo.insert!()

    round =
      %{artifact_id: artifact.id, number: 0, content_hash: hash(content)}
      |> Round.changeset()
      |> Repo.insert!()

    %{artifact: artifact, round: round}
  end

  defp hash(content), do: Base.encode16(:crypto.hash(:sha256, content))
end
