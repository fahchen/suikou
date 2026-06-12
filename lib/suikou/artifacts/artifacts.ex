defmodule Suikou.Artifacts do
  @moduledoc """
  Public API for the artifacts domain: a reviewer mints an artifact by selecting
  a file into a review (round 0, draft) and refreshes a draft round's snapshot
  by re-reading the file from disk after the agent edits it. Rounds advance only
  when the reviewer submits a round (see `Suikou.Submissions`); the agent never
  submits content (BDR-0018).

  This facade is the only module other layers may call; its internal submodules
  are reachable only from within the domain.
  """

  alias Suikou.Artifacts.Asset
  alias Suikou.Artifacts.FileSource

  @type create_error() :: FileSource.create_error()
  @type resolve_asset_error() :: Asset.resolve_error()
  @type read_content_error() :: Asset.read_error()

  @doc """
  Creates an artifact at round 0 from a file selected into a review. See
  `Suikou.Artifacts.FileSource.create/2`.

  ## Examples

      Suikou.Artifacts.create_from_file(review, "docs/plan.md")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  defdelegate create_from_file(review, file_path), to: FileSource, as: :create

  @doc """
  Refreshes a draft round's snapshot from disk and re-anchors its line-scoped
  comments. See `Suikou.Artifacts.FileSource.resnapshot/1`.

  ## Examples

      Suikou.Artifacts.resnapshot(round.id)
      #=> {:ok, %Suikou.Schemas.Round{number: 1}}

  """
  defdelegate resnapshot(round_id), to: FileSource

  @doc """
  Resolves an asset reference from an artifact's markdown to a file on disk. See
  `Suikou.Artifacts.Asset.resolve/2`.

  ## Examples

      Suikou.Artifacts.resolve_asset(artifact.id, "img/diagram.png")
      #=> {:ok, "/projects/app/docs/img/diagram.png"}

  """
  defdelegate resolve_asset(artifact_id, request_path), to: Asset, as: :resolve

  @doc """
  Resolves an artifact's own source file to an absolute path on disk, so the
  reviewed content can be served or read live. See
  `Suikou.Artifacts.Asset.content_path/1`.

  ## Examples

      Suikou.Artifacts.content_path(artifact.id)
      #=> {:ok, "/projects/app/docs/plan.md"}

  """
  defdelegate content_path(artifact_id), to: Asset

  @doc """
  Reads an artifact's own source file live from disk, so the reviewed content
  can be rendered or a comment quote captured. See
  `Suikou.Artifacts.Asset.read_content/1`.

  ## Examples

      Suikou.Artifacts.read_content(artifact.id)
      #=> {:ok, "# Plan\\n"}

  """
  defdelegate read_content(artifact_id), to: Asset

  @doc """
  Reads an artifact's source file live, returning `nil` on any failure. See
  `Suikou.Artifacts.Asset.read_content_or_nil/1`.

  ## Examples

      Suikou.Artifacts.read_content_or_nil(artifact.id)
      #=> "# Plan\\n"

  """
  defdelegate read_content_or_nil(artifact_id), to: Asset
end
