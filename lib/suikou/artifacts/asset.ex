defmodule Suikou.Artifacts.Asset do
  @moduledoc """
  Resolves and reads an artifact's files live from disk: its own reviewed source
  (`content_path/1`, `read_content/1`) and the assets its markdown references
  (`resolve/2`). Every path is resolved under one of the review's two content
  roots and validated so a reference can never escape the root it names — see
  `Suikou.ReviewRoots`.
  """

  alias Suikou.Repo
  alias Suikou.ReviewRoots
  alias Suikou.Schemas.Artifact

  @type resolve_error() :: :artifact_not_found | :unsafe_path | :not_a_file
  @type read_error() :: resolve_error() | :read_failed

  @doc """
  Resolves `request_path`, an asset reference from `artifact_id`'s markdown, to
  an absolute file path under one of its review's roots.

  The checkout is the default root: an unmarked reference is a path under it,
  and `@scratch` opts into the review's scratch directory instead. Only an
  artifact that already lives in the checkout resolves a reference relative to
  its own directory — that is where a relative link has always pointed. Either
  way `Path.safe_relative/2` runs against exactly one base.

  Returns `{:error, :artifact_not_found}` for an unknown artifact, `{:error,
  :unsafe_path}` when the reference escapes its root, and `{:error,
  :not_a_file}` when nothing regular lives at the target.

  ## Examples

      Suikou.Artifacts.Asset.resolve(artifact.id, "img/diagram.png")
      #=> {:ok, "/projects/app/docs/img/diagram.png"}

      Suikou.Artifacts.Asset.resolve(scratch_artifact.id, "docs/img/diagram.png")
      #=> {:ok, "/projects/app/docs/img/diagram.png"}

      Suikou.Artifacts.Asset.resolve(artifact.id, "../../etc/passwd")
      #=> {:error, :unsafe_path}

  """
  @spec resolve(Ecto.UUID.t(), String.t()) :: {:ok, String.t()} | {:error, resolve_error()}
  def resolve(artifact_id, request_path) when is_binary(request_path) do
    case load(artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{} = artifact -> resolve_under(artifact, reference(artifact, request_path))
    end
  end

  # A marked reference addresses a root directly. An unmarked one is a checkout
  # path, so only an artifact already in the checkout joins it onto its own
  # directory — a scratch artifact would otherwise drag the reference into a root
  # the writer did not name.
  defp reference(%Artifact{} = artifact, request_path) do
    cond do
      ReviewRoots.marked?(request_path) -> request_path
      ReviewRoots.scratch?(artifact.file_path) -> request_path
      true -> Path.join(Path.dirname(artifact.file_path), request_path)
    end
  end

  @doc """
  Resolves an artifact's own source file to an absolute path under its root,
  bounds-checked the same way as `resolve/2`. The reviewed content is read live
  from disk rather than stored, so callers serve or read this path on demand.

  Returns `{:error, :artifact_not_found}` for an unknown artifact, `{:error,
  :unsafe_path}` when the stored path escapes its root, and `{:error,
  :not_a_file}` when the file is missing or not regular.

  ## Examples

      Suikou.Artifacts.Asset.content_path(artifact.id)
      #=> {:ok, "/projects/app/docs/plan.md"}

      Suikou.Artifacts.Asset.content_path("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec content_path(Ecto.UUID.t()) :: {:ok, String.t()} | {:error, resolve_error()}
  def content_path(artifact_id) do
    case load(artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{} = artifact -> resolve_under(artifact, artifact.file_path)
    end
  end

  defp resolve_under(%Artifact{} = artifact, candidate) do
    with {:ok, absolute} <- ReviewRoots.absolute(artifact.review, candidate),
         true <- File.regular?(absolute) do
      {:ok, absolute}
    else
      {:error, :unsafe_path} -> {:error, :unsafe_path}
      false -> {:error, :not_a_file}
    end
  end

  @doc """
  Reads an artifact's own source file live from disk. The reviewed content is no
  longer stored, so callers read it on demand to render or to capture a comment
  quote. Returns `{:error, :read_failed}` when the resolved file can't be read,
  and the `content_path/1` errors otherwise.

  ## Examples

      Suikou.Artifacts.Asset.read_content(artifact.id)
      #=> {:ok, "# Plan\\n"}

      Suikou.Artifacts.Asset.read_content("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec read_content(Ecto.UUID.t()) :: {:ok, binary()} | {:error, read_error()}
  def read_content(artifact_id) do
    with {:ok, absolute} <- content_path(artifact_id) do
      case File.read(absolute) do
        {:ok, bytes} -> {:ok, bytes}
        {:error, _posix} -> {:error, :read_failed}
      end
    end
  end

  @doc """
  Reads an artifact's source file live, returning `nil` instead of an error when
  it can't be read, for renderers that resolve comment anchors best-effort
  against whatever content is currently available.

  ## Examples

      Suikou.Artifacts.Asset.read_content_or_nil(artifact.id)
      #=> "# Plan\\n"

      Suikou.Artifacts.Asset.read_content_or_nil("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec read_content_or_nil(Ecto.UUID.t()) :: binary() | nil
  def read_content_or_nil(artifact_id) do
    case read_content(artifact_id) do
      {:ok, content} -> content
      {:error, _reason} -> nil
    end
  end

  defp load(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> nil
      %Artifact{} = artifact -> Repo.preload(artifact, review: :project)
    end
  end
end
