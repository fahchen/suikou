defmodule Suikou.Artifacts.DiffSource do
  @moduledoc """
  Reads artifact content from a git-diff review (see BDR-0020): `create/2`
  mints an artifact with round 0 in draft state, and `read/1` returns the
  file's live unified diff text. The diff itself is never stored — only its
  SHA-256 hash lives on the round (via `Suikou.Artifacts.Snapshot`), so a
  head-move resnapshot picks up the new bytes by re-running the diff.

  The review's `source` must be a `Suikou.Schemas.ReviewSource.GitDiff`, with
  `project` preloaded so the git working tree is reachable.
  """

  alias Suikou.Artifacts.Snapshot
  alias Suikou.Git
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round

  @type create_error() ::
          :not_a_git_repo | :git_error | :not_changed | Ecto.Changeset.t()
  @type read_error() :: :not_a_git_repo | :git_error | :not_changed

  @doc """
  Creates an artifact at round 0 from `path`, whose reviewed content is the
  three-dot diff of that file between the review's `base_ref` and `head_ref`.

  Returns `{:error, :not_a_git_repo}` when the project directory is not a git
  working tree, `{:error, :git_error}` when git fails, and
  `{:error, :not_changed}` when the file has no diff between the refs.

  ## Examples

      Suikou.Artifacts.DiffSource.create(review, "lib/app.ex")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  @spec create(Review.t(), String.t()) ::
          {:ok, %{artifact: Artifact.t(), round: Round.t()}}
          | {:error, create_error()}
  def create(%Review{source: %GitDiff{} = git_diff, project: project} = review, path)
      when is_binary(path) do
    case Git.file_diff(project.path, git_diff.base_ref, git_diff.head_ref, path) do
      {:ok, ""} -> {:error, :not_changed}
      {:ok, diff} -> Repo.transaction(fn -> Snapshot.mint!(review, path, diff) end)
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  @doc """
  Returns the artifact's live unified diff text. Used by the facade's
  `content_source/1` (inline branch) and as the resnapshot fetcher for a
  `GitDiff`-sourced review. The artifact must have `review: :project`
  preloaded.

  ## Examples

      Suikou.Artifacts.DiffSource.read(artifact)
      #=> {:ok, "diff --git a/lib/app.ex b/lib/app.ex\\n..."}

  """
  @spec read(Artifact.t()) :: {:ok, binary()} | {:error, read_error()}
  def read(%Artifact{review: %Review{source: %GitDiff{} = git_diff, project: project}} = artifact) do
    case Git.file_diff(project.path, git_diff.base_ref, git_diff.head_ref, artifact.file_path) do
      {:ok, ""} -> {:error, :not_changed}
      {:ok, diff} -> {:ok, diff}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end
end
