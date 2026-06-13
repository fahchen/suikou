defmodule Suikou.Reviews do
  @moduledoc """
  Reviews: a reviewer selects files and whole directories under a project to
  review together. The selection is stored verbatim on the review's
  `FileSelection` source (a directory path stands for every file beneath it) and
  expanded against disk on demand, so files added under a selected directory join
  automatically.
  A `Suikou.Schemas.Artifact` (round 0, draft) is minted lazily the first time a
  file is opened (`open_file/2`); deselecting a file soft-removes its artifact
  while keeping its critique history, and reopening a covered file restores it
  (see BDR-0018).

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection

  @doc """
  Creates a review under a project from a non-empty selection of files and
  directories. Only the selection is stored — no artifacts are minted. Files
  become artifacts lazily when first opened (see `open_file/2`).

  ## Examples

      Suikou.Reviews.create_review(project, %{name: "Launch docs", selections: ["docs", "plan.md"]})
      #=> {:ok, %Suikou.Schemas.Review{name: "Launch docs"}}

      Suikou.Reviews.create_review(project, %{name: "Launch docs", selections: []})
      #=> {:error, :no_files}

  """
  @spec create_review(Project.t(), map()) ::
          {:ok, Review.t()} | {:error, :no_files | Ecto.Changeset.t()}
  def create_review(%Project{} = project, params) do
    selections = Map.get(params, :selections, [])

    changeset =
      Review.create_changeset(project, %{
        name: Map.get(params, :name),
        source: %{__type__: "file_selection", selection_paths: selections}
      })

    cond do
      selections == [] -> {:error, :no_files}
      not changeset.valid? -> {:error, changeset}
      true -> Repo.insert(changeset)
    end
  end

  @doc """
  Replaces a review's stored selection. Only existing artifacts are reconciled
  against the new selection's expansion: a soft-removed artifact whose file is
  covered again is restored, and an active artifact no longer covered is
  soft-removed (keeping its critique history). No new artifacts are minted —
  newly covered files become artifacts lazily on first open.

  ## Examples

      Suikou.Reviews.set_selection(review, ["lib", "readme.md"])
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec set_selection(Review.t(), [String.t()]) :: {:ok, Review.t()}
  def set_selection(%Review{source: %FileSelection{}} = review, selections) do
    # Force-load every artifact, including soft-removed ones, so a re-covered
    # file is restored rather than left dangling (see BDR-0018).
    review = Repo.preload(review, [:project, :artifacts], force: true)
    target = MapSet.new(expand(review.project, selections))
    artifacts = review.artifacts

    Repo.transaction(fn ->
      updated = review |> Review.selection_changeset(selections) |> Repo.update!()

      for artifact <- artifacts,
          do: reconcile!(artifact, MapSet.member?(target, artifact.file_path))

      updated
    end)
  end

  @doc """
  Opens a covered file in the review, returning its artifact — minting it (round
  0) on first open, restoring it if it was soft-removed, or returning the
  existing one. Rejects a path not covered by the stored selection.

  ## Examples

      Suikou.Reviews.open_file(review, "docs/plan.md")
      #=> {:ok, %Suikou.Schemas.Artifact{}}

      Suikou.Reviews.open_file(review, "not/selected.md")
      #=> {:error, :not_covered}

  """
  @spec open_file(Review.t(), String.t()) ::
          {:ok, Artifact.t()} | {:error, :not_covered | Artifacts.create_error()}
  def open_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    review = Repo.preload(review, :project)

    if path in expand(review.project, paths) do
      mint_or_get(review, path)
    else
      {:error, :not_covered}
    end
  end

  @doc """
  Renames a review, leaving its files and critique history untouched.

  ## Examples

      Suikou.Reviews.rename_review(review, "Spec pass")
      #=> {:ok, %Suikou.Schemas.Review{name: "Spec pass"}}

  """
  @spec rename_review(Review.t(), String.t()) ::
          {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def rename_review(%Review{} = review, name) do
    review |> Review.rename_changeset(%{name: name}) |> Repo.update()
  end

  @doc """
  Deletes a review and every artifact, round, and comment beneath it (the
  database cascades on the foreign keys). Unlike removing a single file, this
  discards the review's whole critique history.

  ## Examples

      Suikou.Reviews.delete_review(review)
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec delete_review(Review.t()) :: {:ok, Review.t()} | {:error, Ecto.Changeset.t()}
  def delete_review(%Review{} = review), do: Repo.delete(review)

  @doc """
  Fetches a review by id with its project and active (not soft-removed) files
  preloaded, or `nil` when none exists.

  ## Examples

      Suikou.Reviews.get_review(review.id)
      #=> %Suikou.Schemas.Review{}

      Suikou.Reviews.get_review("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get_review(Ecto.UUID.t()) :: Review.t() | nil
  def get_review(review_id) do
    preload_active(Repo.get(Review, review_id))
  end

  @doc """
  Lists a project's reviews, newest first, each with its active files preloaded.

  ## Examples

      Suikou.Reviews.list_for_project(project)
      #=> [%Suikou.Schemas.Review{}]

  """
  @spec list_for_project(Project.t()) :: [Review.t()]
  def list_for_project(%Project{} = project) do
    from(r in Review, as: :review, where: r.project_id == ^project.id, order_by: [desc: r.id])
    |> Repo.all()
    |> preload_active()
  end

  @doc """
  Lists a review's current files by expanding its selection against disk. Each
  entry carries the file path, the id of its already-minted active artifact (or
  `nil` when the file has not been opened yet), and whether it is approved.
  Walked on demand, never on the board render.

  ## Examples

      Suikou.Reviews.list_files(review)
      #=> [%{path: "docs/plan.md", artifact_id: nil, approved: false}]

  """
  @spec list_files(Review.t()) ::
          [%{path: String.t(), artifact_id: Ecto.UUID.t() | nil, approved: boolean()}]
  def list_files(%Review{source: %FileSelection{selection_paths: paths}} = review) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}

    review.project
    |> expand(paths)
    |> Enum.map(&file_entry(&1, Map.get(active, &1)))
  end

  defp file_entry(path, nil), do: %{path: path, artifact_id: nil, approved: false}

  defp file_entry(path, %Artifact{} = artifact) do
    %{path: path, artifact_id: artifact.id, approved: not is_nil(artifact.approved_round)}
  end

  # A selected directory stands for every file beneath it; a selected file is
  # itself. Expansion reads the directory live, so membership is dynamic — files
  # added under a selected directory appear without editing the selection.
  defp expand(%Project{} = project, paths) do
    paths
    |> Enum.flat_map(fn path ->
      if File.dir?(Path.join(project.path, path)),
        do: Projects.list_files(project, path),
        else: [path]
    end)
    |> Enum.uniq()
  end

  defp mint_or_get(review, path) do
    case find_artifact(review.id, path) do
      %Artifact{removed_at: nil} = artifact -> {:ok, artifact}
      %Artifact{} = artifact -> {:ok, restore!(artifact)}
      nil -> mint(review, path)
    end
  end

  defp mint(review, path) do
    case Artifacts.create_from_file(review, path) do
      {:ok, %{artifact: artifact}} -> {:ok, artifact}
      {:error, reason} -> {:error, reason}
    end
  rescue
    # Lost a concurrent-open race: the unique (review_id, file_path) index
    # rejected the second insert. The winner's row already exists.
    Ecto.InvalidChangesetError -> {:ok, find_artifact(review.id, path)}
  end

  defp find_artifact(review_id, path) do
    query =
      from(a in Artifact,
        as: :artifact,
        where: a.review_id == ^review_id and a.file_path == ^path
      )

    Repo.one(query)
  end

  defp reconcile!(artifact, selected) do
    cond do
      selected and not is_nil(artifact.removed_at) -> restore!(artifact)
      not selected and is_nil(artifact.removed_at) -> remove!(artifact)
      true -> :ok
    end
  end

  defp restore!(artifact) do
    artifact |> Artifact.restore_changeset() |> Repo.update!()
  end

  defp remove!(artifact) do
    artifact |> Artifact.remove_changeset(DateTime.utc_now(:second)) |> Repo.update!()
  end

  defp preload_active(reviews) do
    active = from(a in Artifact, where: is_nil(a.removed_at), order_by: [asc: a.file_path])
    Repo.preload(reviews, [:project, artifacts: active])
  end
end
