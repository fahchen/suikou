defmodule Suikou.Artifacts.Asset do
  @moduledoc """
  Resolves a relative asset path (an image referenced from an artifact's
  markdown) to a regular file on disk. The reference is interpreted relative to
  the artifact's own directory inside its project, and the resolved path is
  validated so a reference can never escape the project directory.
  """

  alias Suikou.Repo
  alias Suikou.Schemas.Artifact

  @type resolve_error() :: :artifact_not_found | :unsafe_path | :not_a_file

  @doc """
  Resolves `request_path`, an asset reference from `artifact_id`'s markdown, to
  an absolute file path under the artifact's project.

  The reference is joined onto the artifact's directory, then checked with
  `Path.safe_relative/2` so a `../` chain can never escape the project. Returns
  `{:error, :artifact_not_found}` for an unknown artifact, `{:error,
  :unsafe_path}` when the reference escapes the project, and `{:error,
  :not_a_file}` when nothing regular lives at the target.

  ## Examples

      Suikou.Artifacts.Asset.resolve(artifact.id, "img/diagram.png")
      #=> {:ok, "/projects/app/docs/img/diagram.png"}

      Suikou.Artifacts.Asset.resolve(artifact.id, "../../etc/passwd")
      #=> {:error, :unsafe_path}

  """
  @spec resolve(Ecto.UUID.t(), String.t()) :: {:ok, String.t()} | {:error, resolve_error()}
  def resolve(artifact_id, request_path) when is_binary(request_path) do
    with %Artifact{} = artifact <- load(artifact_id),
         candidate = Path.join(Path.dirname(artifact.file_path), request_path),
         {:ok, relative} <- safe_relative(candidate, artifact.review.project.path),
         absolute = Path.join(artifact.review.project.path, relative),
         true <- File.regular?(absolute) do
      {:ok, absolute}
    else
      nil -> {:error, :artifact_not_found}
      :error -> {:error, :unsafe_path}
      false -> {:error, :not_a_file}
    end
  end

  defp load(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> nil
      %Artifact{} = artifact -> Repo.preload(artifact, review: :project)
    end
  end

  defp safe_relative(candidate, project_path) do
    case Path.safe_relative(candidate, project_path) do
      {:ok, relative} -> {:ok, relative}
      :error -> :error
    end
  end
end
