defmodule Suikou.Artifacts do
  @moduledoc """
  Public API for the artifacts domain: a reviewer mints an artifact by
  selecting a file into a review or by opening a path changed in a git-diff
  review (round 0, draft), and refreshes a draft round's snapshot by
  re-reading the source live after the agent edits the file or moves the head
  branch. Rounds advance only when the reviewer submits a round (see
  `Suikou.Submissions`); the agent never submits content (BDR-0018, BDR-0020).

  This facade is the only module other layers may call; its internal
  submodules are reachable only from within the domain.
  """

  alias Suikou.Artifacts.Asset
  alias Suikou.Artifacts.DiffSource
  alias Suikou.Artifacts.FileSource
  alias Suikou.Artifacts.Snapshot
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round

  @type create_error() :: FileSource.create_error() | DiffSource.create_error()
  @type resolve_asset_error() :: Asset.resolve_error()
  @type read_content_error() :: Asset.read_error()
  @type resnapshot_error() ::
          :round_not_found | :not_latest_round | Snapshot.fetch_content_error()
  @type content_source_error() ::
          :artifact_not_found | :unsafe_path | :not_a_file | DiffSource.read_error()
  @type content_source() ::
          {:file, String.t()} | {:inline, binary(), String.t()}

  @doc """
  Creates an artifact at round 0 from a file selected into a review. See
  `Suikou.Artifacts.FileSource.create/2`.

  ## Examples

      Suikou.Artifacts.create_from_file(review, "docs/plan.md")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  @spec create_from_file(Review.t(), String.t()) ::
          {:ok, %{artifact: Artifact.t(), round: Round.t()}}
          | {:error, FileSource.create_error()}
  defdelegate create_from_file(review, file_path), to: FileSource, as: :create

  @doc """
  Creates an artifact at round 0 from a changed path in a git-diff review.
  See `Suikou.Artifacts.DiffSource.create/2`.

  ## Examples

      Suikou.Artifacts.create_from_diff(review, "lib/app.ex")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  @spec create_from_diff(Review.t(), String.t()) ::
          {:ok, %{artifact: Artifact.t(), round: Round.t()}}
          | {:error, DiffSource.create_error()}
  defdelegate create_from_diff(review, file_path), to: DiffSource, as: :create

  @doc """
  Refreshes a draft round's snapshot, dispatching on the review's source: for
  a file-selection review, re-reads the file from disk; for a git-diff review,
  re-runs `git diff` between the review's refs so a head move is picked up.

  ## Examples

      Suikou.Artifacts.resnapshot(round.id)
      #=> {:ok, %Suikou.Schemas.Round{number: 1}}

  """
  @spec resnapshot(Ecto.UUID.t()) :: {:ok, Round.t()} | {:error, resnapshot_error()}
  def resnapshot(round_id) do
    Snapshot.resnapshot(round_id, &fetch_for_resnapshot/1)
  end

  defp fetch_for_resnapshot(%Artifact{review: %Review{source: %FileSelection{}}} = artifact),
    do: FileSource.read(artifact)

  defp fetch_for_resnapshot(%Artifact{review: %Review{source: %GitDiff{}}} = artifact),
    do: DiffSource.read(artifact)

  @doc """
  Returns how to serve an artifact's reviewed content, dispatched by review
  source: a file-selection artifact answers `{:file, absolute_path}` so the
  caller can `send_file`; a git-diff artifact answers
  `{:inline, diff_text, "text/x-diff"}` with the live diff re-run from git.

  ## Examples

      Suikou.Artifacts.content_source(file_artifact.id)
      #=> {:ok, {:file, "/projects/app/docs/plan.md"}}

      Suikou.Artifacts.content_source(diff_artifact.id)
      #=> {:ok, {:inline, "diff --git a/lib/app.ex ...", "text/x-diff"}}

  """
  @spec content_source(Ecto.UUID.t()) ::
          {:ok, content_source()} | {:error, content_source_error()}
  def content_source(artifact_id) do
    case load_artifact(artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{review: %Review{source: %FileSelection{}}} -> file_content_source(artifact_id)
      %Artifact{review: %Review{source: %GitDiff{}}} = artifact -> diff_content_source(artifact)
    end
  end

  defp file_content_source(artifact_id) do
    with {:ok, absolute} <- Asset.content_path(artifact_id), do: {:ok, {:file, absolute}}
  end

  defp diff_content_source(%Artifact{} = artifact) do
    with {:ok, diff} <- DiffSource.read(artifact), do: {:ok, {:inline, diff, "text/x-diff"}}
  end

  defp load_artifact(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> nil
      %Artifact{} = artifact -> Repo.preload(artifact, review: :project)
    end
  end

  @doc """
  Resolves an asset reference from an artifact's markdown to a file on disk. See
  `Suikou.Artifacts.Asset.resolve/2`.

  ## Examples

      Suikou.Artifacts.resolve_asset(artifact.id, "img/diagram.png")
      #=> {:ok, "/projects/app/docs/img/diagram.png"}

  """
  @spec resolve_asset(Ecto.UUID.t(), String.t()) ::
          {:ok, String.t()} | {:error, resolve_asset_error()}
  defdelegate resolve_asset(artifact_id, request_path), to: Asset, as: :resolve

  @doc """
  Resolves an artifact's own source file to an absolute path on disk, so the
  reviewed content can be served or read live. See
  `Suikou.Artifacts.Asset.content_path/1`.

  ## Examples

      Suikou.Artifacts.content_path(artifact.id)
      #=> {:ok, "/projects/app/docs/plan.md"}

  """
  @spec content_path(Ecto.UUID.t()) :: {:ok, String.t()} | {:error, Asset.resolve_error()}
  defdelegate content_path(artifact_id), to: Asset

  @doc """
  Reads an artifact's own source file live from disk, so the reviewed content
  can be rendered or a comment quote captured. See
  `Suikou.Artifacts.Asset.read_content/1`.

  ## Examples

      Suikou.Artifacts.read_content(artifact.id)
      #=> {:ok, "# Plan\\n"}

  """
  @spec read_content(Ecto.UUID.t()) :: {:ok, binary()} | {:error, read_content_error()}
  defdelegate read_content(artifact_id), to: Asset

  @doc """
  Reads an artifact's source file live, returning `nil` on any failure. See
  `Suikou.Artifacts.Asset.read_content_or_nil/1`.

  ## Examples

      Suikou.Artifacts.read_content_or_nil(artifact.id)
      #=> "# Plan\\n"

  """
  @spec read_content_or_nil(Ecto.UUID.t()) :: binary() | nil
  defdelegate read_content_or_nil(artifact_id), to: Asset
end
