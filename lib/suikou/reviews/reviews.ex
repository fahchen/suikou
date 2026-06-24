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
  alias Suikou.Events
  alias Suikou.Git
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Submissions

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
  Lists `project`'s candidate branches together with its resolved default
  branch, for the board's diff-review creation picker (see BDR-0020).
  Returns local branches under `:branches` and `origin/*` remote-tracking
  branches under `:remote_branches`, each sorted by descending commit date.
  `:default` is the repository default branch via `Suikou.Git.default_branch/1`
  and is the suggested base. `:remote_branches` is `[]` when no `origin`
  remote is configured.

  Returns `{:error, :not_a_git_repo}` when `project.path` is not a git working
  tree, and `{:error, :git_error}` when git fails.

  ## Examples

      Suikou.Reviews.list_branches(project)
      #=> {:ok, %{branches: ["topic", "main"], remote_branches: ["origin/main"], default: "main"}}

  """
  @spec list_branches(Project.t()) ::
          {:ok, %{branches: [String.t()], remote_branches: [String.t()], default: String.t()}}
          | {:error, :not_a_git_repo | :git_error}
  def list_branches(%Project{path: path}) do
    with {:ok, branches} <- local_or_error(path),
         {:ok, remote_branches} <- remote_or_error(path),
         {:ok, default} <- default_or_error(path) do
      {:ok, %{branches: branches, remote_branches: remote_branches, default: default}}
    end
  end

  defp local_or_error(path) do
    case Git.list_branches(path) do
      {:ok, branches} -> {:ok, branches}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, :git_error} -> {:error, :git_error}
    end
  end

  defp remote_or_error(path) do
    case Git.list_remote_branches(path) do
      {:ok, branches} -> {:ok, branches}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, :git_error} -> {:error, :git_error}
    end
  end

  defp default_or_error(path) do
    case Git.default_branch(path) do
      {:ok, ref} -> {:ok, ref}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
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
             | :no_changes
             | :git_error
             | Ecto.Changeset.t()}
  def create_diff_review(%Project{} = project, params) do
    with :ok <- ensure_git_repo(project),
         {:ok, base} <- resolve_base_ref(project, params),
         {:ok, head} <- fetch_head_ref(params),
         :ok <- ensure_ref(project, base, :base_ref_not_found),
         :ok <- ensure_ref(project, head, :head_ref_not_found),
         :ok <- ensure_changes(project, base, head),
         {:ok, base_sha} <- pin_sha(project, base),
         {:ok, head_sha} <- pin_sha(project, head) do
      changeset =
        Review.create_changeset(project, %{
          name: Map.get(params, :name),
          source: %{
            __type__: "git_diff",
            base_ref: base,
            head_ref: head,
            base_sha: base_sha,
            head_sha: head_sha
          }
        })

      if changeset.valid?, do: Repo.insert(changeset), else: {:error, changeset}
    end
  end

  defp pin_sha(%Project{path: path}, ref) do
    case Git.rev_parse(path, ref) do
      {:ok, sha} -> {:ok, sha}
      {:error, _reason} -> {:error, :git_error}
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

    result =
      Repo.transaction(fn ->
        updated = review |> Review.selection_changeset(selections) |> Repo.update!()

        for artifact <- artifacts,
            do: reconcile!(artifact, MapSet.member?(target, artifact.file_path))

        updated
      end)

    broadcast_review_change(result)
  end

  @doc """
  Drops a single path from a file-selection review, soft-removing its artifact
  if one was minted (history preserved) and shrinking the stored selection so
  the file stops appearing in the file list. Used to clear a row whose source
  was deleted or moved. Errors for diff reviews, whose file list is derived from
  the diff and can't be edited by hand.

  ## Examples

      Suikou.Reviews.remove_file(review, "docs/old.md")
      #=> {:ok, %Suikou.Schemas.Review{}}

  """
  @spec remove_file(Review.t(), String.t()) ::
          {:ok, Review.t()} | {:error, :not_a_file_selection}
  def remove_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    # ponytail: literal-path removal. A file covered only via a parent directory
    # in the selection stays listed; explicit-path selections (the common case)
    # drop cleanly.
    set_selection(review, paths -- [path])
  end

  def remove_file(%Review{source: %GitDiff{}}, _path), do: {:error, :not_a_file_selection}

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
          | {:error, :not_covered | :not_a_git_repo | :git_error | Artifacts.create_error()}
  def open_file(%Review{source: %FileSelection{selection_paths: paths}} = review, path) do
    review = Repo.preload(review, :project)

    if path in expand(review.project, paths) do
      mint_or_get(review, path, &Artifacts.create_from_file/2)
    else
      {:error, :not_covered}
    end
  end

  def open_file(%Review{source: %GitDiff{} = git_diff} = review, path) do
    review = Repo.preload(review, :project)

    case changed_paths(review.project, git_diff) do
      {:ok, paths} ->
        if path in paths,
          do: mint_or_get(review, path, &Artifacts.create_from_diff/2),
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
  entry carries the file path, the id of its already-minted active artifact
  (or `nil` when the file has not been opened yet), whether it is approved,
  `content_hash` — a stable cache key for the file's current bytes (SHA-256
  hex of the on-disk file for a selection review; the head ref's git blob hash
  for a diff review) — and `change_status`, the file's diff modification kind
  for a diff review (`:added | :modified | :deleted | :renamed | :copied |
  :type_changed`) or `nil` for a selection review. `content_hash` is `nil`
  when the file cannot be read at the source (deleted-at-head, unreadable,
  etc.). Walked on demand, never on the board render.

  ## Examples

      Suikou.Reviews.list_files(review)
      #=> [%{path: "docs/plan.md", artifact_id: nil, approved: false, content_hash: "AB12...", change_status: nil}]

  """
  @spec list_files(Review.t()) :: [file_entry()]
  def list_files(%Review{source: %FileSelection{selection_paths: paths}} = review) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}

    review.project
    |> expand(paths)
    |> Enum.map(&file_entry(&1, Map.get(active, &1), file_content_hash(review.project, &1), nil))
  end

  def list_files(%Review{source: %GitDiff{} = git_diff} = review) do
    review = Repo.preload(review, [:project, :artifacts], force: true)
    active = for a <- review.artifacts, is_nil(a.removed_at), into: %{}, do: {a.file_path, a}

    case changed_with_status(review.project, git_diff) do
      {:ok, entries} ->
        sorted = Enum.sort_by(entries, & &1.path)
        paths = Enum.map(sorted, & &1.path)
        blobs = head_blob_ids(review.project, git_diff, paths)

        Enum.map(sorted, fn %{path: path, status: status} ->
          file_entry(path, Map.get(active, path), Map.get(blobs, path), status)
        end)

      {:error, _reason} ->
        []
    end
  end

  @typep file_entry() :: %{
           path: String.t(),
           artifact_id: Ecto.UUID.t() | nil,
           approved: boolean(),
           verdict: :approve | :request_changes | :comment | nil,
           content_hash: String.t() | nil,
           change_status: Git.change_status() | nil
         }

  defp file_entry(path, nil, content_hash, change_status) do
    %{
      path: path,
      artifact_id: nil,
      approved: false,
      verdict: nil,
      content_hash: content_hash,
      change_status: change_status
    }
  end

  defp file_entry(path, %Artifact{} = artifact, content_hash, change_status) do
    %{
      path: path,
      artifact_id: artifact.id,
      approved: not is_nil(artifact.approved_round),
      verdict: file_verdict(artifact),
      content_hash: content_hash,
      change_status: change_status
    }
  end

  # Per-file verdict: the reviewer's explicit choice on this file. Prefer the
  # latest submitted verdict (a closed round's recorded outcome); fall back to
  # the latest round's `draft_verdict` so an in-progress choice still surfaces
  # as "reviewed" before submission. `nil` means the reviewer has not touched
  # this file's verdict yet — distinct from `:comment`.
  defp file_verdict(%Artifact{} = artifact) do
    case Submissions.latest_verdict_for_artifact(artifact.id) do
      nil -> Submissions.draft_verdict_for_artifact(artifact.id)
      verdict -> verdict
    end
  end

  @type content_source() ::
          {:file, String.t()} | {:inline, binary(), String.t()}
  @type content_by_path_error() ::
          :path_not_in_review
          | :unsafe_path
          | :not_a_file
          | :not_a_git_repo
          | :git_error
          | :not_changed
  @type raw_by_path_error() ::
          :path_not_in_review
          | :unsafe_path
          | :not_a_file
          | :not_a_git_repo
          | :git_error

  @doc """
  Returns how to serve the live content for `path` inside `review` without
  minting an artifact, dispatched by review source: a file-selection review
  answers `{:file, absolute_path}` so the caller can `send_file`; a git-diff
  review answers `{:inline, diff_text, "text/x-diff"}` with the live diff
  re-run from git. Mirrors `Suikou.Artifacts.content_source/1`'s contract so
  the controller can render either branch the same way.

  Security: `path` is whitelisted against the review's current `list_files/1`
  set. Anything outside that set (arbitrary filesystem path, `../` traversal,
  unrelated repo entries) is rejected as `:path_not_in_review`.

  ## Examples

      Suikou.Reviews.fetch_content_by_path(review, "docs/plan.md")
      #=> {:ok, {:file, "/projects/app/docs/plan.md"}}

      Suikou.Reviews.fetch_content_by_path(review, "../secret")
      #=> {:error, :path_not_in_review}

  """
  @spec fetch_content_by_path(Review.t(), String.t()) ::
          {:ok, content_source()} | {:error, content_by_path_error()}
  def fetch_content_by_path(%Review{} = review, path) when is_binary(path) do
    review = Repo.preload(review, [:project])

    if path_in_review?(review, path),
      do: read_content_by_path(review, path),
      else: {:error, :path_not_in_review}
  end

  defp path_in_review?(%Review{} = review, path) do
    Enum.any?(list_files(review), &(&1.path == path))
  end

  defp read_content_by_path(%Review{source: %FileSelection{}, project: project}, path) do
    file_selection_content_source(project, path)
  end

  defp read_content_by_path(
         %Review{source: %GitDiff{} = git_diff, project: project},
         path
       ) do
    case Git.file_diff(project.path, git_diff.base_ref, git_diff.head_ref, path) do
      {:ok, ""} -> {:error, :not_changed}
      {:ok, diff} -> {:ok, {:inline, diff, "text/x-diff"}}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  @doc """
  Returns how to serve the raw file bytes for `path` inside `review` without
  minting an artifact: a file-selection review answers `{:file, absolute_path}`
  so the caller can `send_file` (same shape as `fetch_content_by_path/2`); a
  git-diff review answers `{:inline, blob_bytes, content_type}` with the
  file's bytes at the head ref and a media type derived from the path's
  extension. Used by the review surface to preview images and other binary
  files in "all files" mode regardless of review source, where
  `fetch_content_by_path/2` would otherwise return the unified diff text for
  a git-diff review.

  Security: same whitelist as `fetch_content_by_path/2` — `path` must appear
  in `list_files/1`. Anything outside that set is rejected as
  `:path_not_in_review`.

  ## Examples

      Suikou.Reviews.fetch_raw_by_path(review, "img/logo.png")
      #=> {:ok, {:inline, <<...png bytes...>>, "image/png"}}

      Suikou.Reviews.fetch_raw_by_path(review, "../secret")
      #=> {:error, :path_not_in_review}

  """
  @spec fetch_raw_by_path(Review.t(), String.t()) ::
          {:ok, content_source()} | {:error, raw_by_path_error()}
  def fetch_raw_by_path(%Review{} = review, path) when is_binary(path) do
    review = Repo.preload(review, [:project])

    if path_in_review?(review, path),
      do: read_raw_by_path(review, path),
      else: {:error, :path_not_in_review}
  end

  defp read_raw_by_path(%Review{source: %FileSelection{}, project: project}, path) do
    file_selection_content_source(project, path)
  end

  defp read_raw_by_path(%Review{source: %GitDiff{} = git_diff, project: project}, path) do
    case Git.show_blob(project.path, git_diff.head_ref, path) do
      {:ok, bytes} -> {:ok, {:inline, bytes, MIME.from_path(path)}}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp file_selection_content_source(%Project{} = project, path) do
    case Path.safe_relative(path, project.path) do
      {:ok, relative} ->
        absolute = Path.join(project.path, relative)
        if File.regular?(absolute), do: {:ok, {:file, absolute}}, else: {:error, :not_a_file}

      :error ->
        {:error, :unsafe_path}
    end
  end

  defp file_content_hash(%Project{path: project_path}, rel_path) do
    absolute = Path.join(project_path, rel_path)

    with true <- File.regular?(absolute),
         {:ok, bytes} <- File.read(absolute) do
      Base.encode16(:crypto.hash(:sha256, bytes))
    else
      _missing_or_unreadable -> nil
    end
  end

  defp head_blob_ids(%Project{path: project_path}, %GitDiff{head_ref: head_ref}, paths) do
    case Git.blob_ids(project_path, head_ref, paths) do
      {:ok, map} -> map
      {:error, _reason} -> %{}
    end
  end

  # A selected directory stands for every file beneath it; a selected file is
  # itself. Expansion reads the directory live, so membership is dynamic — files
  # added under a selected directory appear without editing the selection. A
  # selected file is dropped when the project no longer lists it (gitignored or
  # under `.git`), so a stale selection never leaks once the toggle is on.
  defp expand(%Project{} = project, paths) do
    paths
    |> Enum.flat_map(fn path ->
      cond do
        File.dir?(Path.join(project.path, path)) -> Projects.list_files(project, path)
        Projects.listable?(project, path) -> [path]
        true -> []
      end
    end)
    |> Enum.uniq()
  end

  defp broadcast_review_change({:ok, %Review{id: review_id}} = result) do
    Events.review_changed(review_id)
    result
  end

  defp broadcast_review_change({:ok, %Artifact{review_id: review_id}} = result) do
    Events.review_changed(review_id)
    result
  end

  defp broadcast_review_change(result), do: result

  defp mint_or_get(review, path, create_fun) do
    result =
      case find_artifact(review.id, path) do
        %Artifact{removed_at: nil} = artifact -> {:ok, artifact}
        %Artifact{} = artifact -> {:ok, restore!(artifact)}
        nil -> mint(review, path, create_fun)
      end

    broadcast_review_change(result)
  end

  defp mint(review, path, create_fun) do
    case create_fun.(review, path) do
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

  # Refs/repo are already validated above, so an empty list means a base==head
  # (or otherwise no-change) pair — reject before persisting an empty review. A
  # git failure here is a real error, distinct from "no diff".
  defp ensure_changes(%Project{path: path}, base, head) do
    case Git.changed_files(path, base, head) do
      {:ok, []} -> {:error, :no_changes}
      {:ok, [_head | _rest]} -> :ok
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp changed_paths(%Project{path: path}, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.changed_files(path, base, head) do
      {:ok, paths} -> {:ok, paths}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end

  defp changed_with_status(%Project{path: path}, %GitDiff{base_ref: base, head_ref: head}) do
    case Git.changed_files_with_status(path, base, head) do
      {:ok, entries} -> {:ok, entries}
      {:error, :not_a_repo} -> {:error, :not_a_git_repo}
      {:error, _reason} -> {:error, :git_error}
    end
  end
end
