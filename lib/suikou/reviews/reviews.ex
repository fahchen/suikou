defmodule Suikou.Reviews do
  @moduledoc """
  Reviews: a reviewer selects files and whole directories under a project to
  review together. The selection is stored verbatim on the review (a directory
  path stands for every file beneath it) and expanded to concrete files when
  saved; each expanded file becomes one `Suikou.Schemas.Artifact` (round 0,
  draft). The selection is editable — adding a file mints an artifact, removing
  one soft-removes its artifact while keeping its critique history, and re-adding
  a removed file restores it (see BDR-0018).

  Params are atom-keyed maps, matching the rest of the domain.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review

  @type file_error() :: {:file, String.t(), Artifacts.create_error()}

  @doc """
  Creates a review under a project from a non-empty selection of files and
  directories. The selection is stored, then expanded to concrete files (a
  directory to every file beneath it) and one artifact is minted per file. Rolls
  back if any file cannot be read.

  ## Examples

      Suikou.Reviews.create_review(project, %{name: "Launch docs", selections: ["docs", "plan.md"]})
      #=> {:ok, %Suikou.Schemas.Review{name: "Launch docs"}}

      Suikou.Reviews.create_review(project, %{name: "Launch docs", selections: []})
      #=> {:error, :no_files}

  """
  @spec create_review(Project.t(), map()) ::
          {:ok, Review.t()} | {:error, :no_files | Ecto.Changeset.t() | file_error()}
  def create_review(%Project{} = project, params) do
    selections = Map.get(params, :selections, [])

    changeset =
      Review.create_changeset(project, %{
        name: Map.get(params, :name),
        selection_paths: selections
      })

    cond do
      selections == [] ->
        {:error, :no_files}

      not changeset.valid? ->
        {:error, changeset}

      true ->
        Repo.transaction(fn -> insert_review!(project, changeset, selections) end)
    end
  end

  defp insert_review!(project, changeset, selections) do
    review = %{Repo.insert!(changeset) | project: project}
    for path <- expand(project, selections), do: add_file!(review, path)
    review
  end

  @doc """
  Replaces a review's selection of files and directories. Stores the new
  selection, then reconciles artifacts against its expansion: mints artifacts
  for newly covered files, restores soft-removed files that reappear, and
  soft-removes files no longer covered. Rolls back if a newly added file cannot
  be read.

  ## Examples

      Suikou.Reviews.set_selection(review, ["lib", "readme.md"])
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec set_selection(Review.t(), [String.t()]) ::
          {:ok, Review.t()} | {:error, file_error()}
  def set_selection(%Review{} = review, selections) do
    # Force-load every artifact, including soft-removed ones: callers pass a
    # review preloaded with active artifacts only, so without `force` a removed
    # file would be invisible here and re-adding it would mint a duplicate
    # instead of restoring its critique history (see BDR-0018).
    review = Repo.preload(review, [:project, :artifacts], force: true)
    target = MapSet.new(expand(review.project, selections))
    by_path = Map.new(review.artifacts, &{&1.file_path, &1})
    known = MapSet.new(Map.keys(by_path))

    Repo.transaction(fn ->
      review = review |> Review.selection_changeset(selections) |> Repo.update!()
      for path <- MapSet.difference(target, known), do: add_file!(review, path)
      for {path, artifact} <- by_path, do: reconcile!(artifact, MapSet.member?(target, path))
      review
    end)
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

  # A selected directory stands for every file beneath it now; a selected file is
  # itself. Expansion reads the directory live, so the artifacts it mints are a
  # snapshot of the files present when the selection was saved.
  defp expand(%Project{} = project, paths) do
    paths
    |> Enum.flat_map(fn path ->
      if File.dir?(Path.join(project.path, path)),
        do: Projects.list_files(project, path),
        else: [path]
    end)
    |> Enum.uniq()
  end

  defp add_file!(review, path) do
    case Artifacts.create_from_file(review, path) do
      {:ok, _result} -> :ok
      {:error, reason} -> Repo.rollback({:file, path, reason})
    end
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
