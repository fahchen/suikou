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

  alias Suikou.Artifacts.FileSource

  @type create_error() :: FileSource.create_error()

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
end
