defmodule Suikou.Artifacts.FileSource do
  @moduledoc """
  Reads artifact content from a file selected into a review (see BDR-0018):
  `create/2` mints an artifact with round 0 in draft state, and `read/1`
  returns the file's live bytes (used both by `Suikou.Artifacts.content_source/1`
  and by the resnapshot fetcher). The relative path is validated so a selection
  can never escape the project directory.
  """

  alias Suikou.Artifacts.Snapshot
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round

  @type create_error() :: :unsafe_path | :not_a_file | :empty_content | Ecto.Changeset.t()
  @type read_error() :: :not_a_file | :empty_content

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
      Repo.transaction(fn -> Snapshot.mint!(review, relative, content) end)
    end
  end

  @doc """
  Reads the artifact's source file live from disk and rejects an empty file.
  Used by the facade's `content_source/1` (file branch) and as the resnapshot
  fetcher for a `FileSelection`-sourced review.

  ## Examples

      Suikou.Artifacts.FileSource.read(artifact)
      #=> {:ok, "# Plan\\n"}

  """
  @spec read(Artifact.t()) :: {:ok, binary()} | {:error, read_error()}
  def read(%Artifact{} = artifact) do
    with {:ok, content} <- read_regular_file(source_path(artifact)),
         :ok <- ensure_present(content) do
      {:ok, content}
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
end
