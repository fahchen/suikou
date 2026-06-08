defmodule Suikou.Artifacts.FileSource do
  @moduledoc """
  Creates an artifact from a file selected under a project: reads the file from
  disk and persists round 0 in draft state (see BDR-0018). The relative path is
  validated so a selection can never escape the project directory.
  """

  alias Suikou.Repo
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
