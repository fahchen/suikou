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
  alias Suikou.Git
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round

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
  Creates a git-diff review under a project: its artifacts are the files
  changed between `base_ref` and `head_ref` with three-dot merge-base
  semantics. Refs are fixed at creation — changing branches means a new
  review (see BDR-0020). When `base_ref` is omitted it defaults to the
  repository's default branch.

  ## Examples

      Suikou.Reviews.create_diff_review(project, %{name: "Topic", base_ref: "main", head_ref: "topic"})
      #=> {:ok, %Suikou.Schemas.Review{}}

      Suikou.Reviews.create_diff_review(project, %{name: "Topic", head_ref: "missing"})
      #=> {:error, :head_ref_not_found}

  """
  @spec create_diff_review(Project.t(), map()) ::
          {:ok, Review.t()}
          | {:error,
             :not_a_git_repo
             | :missing_head_ref
             | :base_ref_not_found
             | :head_ref_not_found
             | Ecto.Changeset.t()}
  def create_diff_review(%Project{} = project, params) do
    with :ok <- ensure_git_repo(project),
         {:ok, base} <- resolve_base_ref(project, params),
         {:ok, head} <- fetch_head_ref(params),
         :ok <- ensure_ref(project, base, :base_ref_not_found),
         :ok <- ensure_ref(project, head, :head_ref_not_found) do
      changeset =
        Review.create_changeset(project, %{
          name: Map.get(params, :name),
          source: %{__type__: "git_diff", base_ref: base, head_ref: head}
        })

      if changeset.valid?, do: Repo.insert(changeset), else: {:error, changeset}
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
          {:ok, Artifact.t()}
          | {:error,
             :not_covered | :not_a_git_repo | :git_error | Artifacts.create_error()}
  def open_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    review = Repo.preload(review, :project)

    if path in expand(review.project, paths) do
      mint_or_get(review, path)
    else
      {:error, :not_covered}
    end
  end

  def open_file(%Review{source: %GitDiff{} = git_diff} = review, path) do
    review = Repo.preload(review, :project)

    case changed_paths(review.project, git_diff) do
      {:ok, paths} ->
        if path in paths,
          do: diff_mint_or_get(review, git_diff, path),
          else: {:error, :not_covered}

      {:error, reason} ->
        {:error, reason}
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

  def list_files(%Review{source: %GitDiff{} = git_diff} = review) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}

    case changed_paths(review.project, git_diff) do
      {:ok, paths} ->
        paths
        |> Enum.sort()
        |> Enum.map(&file_entry(&1, Map.get(active, &1)))

      {:error, _reason} ->
        []
    end
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

  defp ensure_git_repo(%Project{path: path}) do
    if Git.repo?(path), do: :ok, else: {:error, :not_a_git_repo}
  end

  defp resolve_base_ref(%Project{} = project, params) do
    case Map.get(params, :base_ref) do
      ref when is_binary(ref) and ref != "" ->
        {:ok, ref}

      _missing ->
        case Git.default_branch(project.path) do
          {:ok, ref} -> {:ok, ref}
          {:error, :not_a_repo} -> {:error, :not_a_git_repo}
        end
    end
  end

  defp fetch_head_ref(params) do
    case Map.get(params, :head_ref) do
      ref when is_binary(ref) and ref != "" -> {:ok, ref}
      _missing -> {:error, :missing_head_ref}
    end
  end

  defp ensure_ref(%Project{path: path}, ref, error) do
    if Git.ref_exists?(path, ref), do: :ok, else: {:error, error}
  end

  defp changed_paths(%Project{path: path}, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.changed_files(path, base, head) do
      {:ok, paths} -> {:ok, paths}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp diff_mint_or_get(%Review{} = review, %GitDiff{} = git_diff, path) do
    case find_artifact(review.id, path) do
      %Artifact{removed_at: nil} = artifact -> {:ok, artifact}
      %Artifact{} = artifact -> {:ok, restore!(artifact)}
      nil -> mint_diff(review, git_diff, path)
    end
  end

  defp mint_diff(%Review{} = review, %GitDiff{} = git_diff, path) do
    %Project{path: repo} = review.project

    case Git.file_diff(repo, git_diff.base_ref, git_diff.head_ref, path) do
      {:ok, diff} -> {:ok, insert_diff_artifact(review, path, diff)}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  rescue
    # Lost a concurrent-open race: the unique (review_id, file_path) index
    # rejected the second insert. The winner's row already exists.
    Ecto.InvalidChangesetError -> {:ok, find_artifact(review.id, path)}
  end

  defp insert_diff_artifact(review, path, diff) do
    Repo.transaction(fn ->
      artifact =
        review
        |> Artifact.create_from_file_changeset(%{title: path, file_path: path})
        |> Repo.insert!()

      %{artifact_id: artifact.id, number: 0, content_hash: hash_content(diff)}
      |> Round.changeset()
      |> Repo.insert!()

      artifact
    end)
    |> case do
      {:ok, artifact} -> artifact
    end
  end

  defp hash_content(content), do: Base.encode16(:crypto.hash(:sha256, content))
end
