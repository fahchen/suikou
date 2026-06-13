defmodule SuikouWeb.Stores.ProjectBoardStore do
  @moduledoc """
  Root store backing the project board: the reviewer's entry point.

  Takes no mount params. Renders every registered project with its candidate
  markdown files (for building a selection) and its reviews. A review is a named
  set of selected files, each backed by an artifact (see BDR-0018); the
  `create_review` command mints one from a project and a list of file paths and
  replies with the new review id, while `update_review_files` reconciles a
  review's selection. The `create_project` command registers a directory.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket
  alias Suikou.Projects
  alias Suikou.Reviews
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias SuikouWeb.Iso8601

  state do
    field(
      :projects,
      list(%{
        id: String.t(),
        name: String.t(),
        path: String.t(),
        reviews:
          list(%{
            id: String.t(),
            name: String.t(),
            inserted_at: String.t(),
            selections: list(String.t()),
            selection_count: integer()
          })
      })
    )
  end

  command :create_project do
    payload do
      field(:name, String.t())
      field(:path, String.t())
    end

    reply do
      field(:project_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :create_review do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:selections, list(String.t()))
    end

    reply do
      field(:review_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :create_diff_review do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:base_ref, String.t() | nil)
      field(:head_ref, String.t())
    end

    reply do
      field(:review_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :list_branches do
    payload do
      field(:project_id, String.t())
    end

    reply do
      field(:branches, list(String.t()))
      field(:default, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :update_review_files do
    payload do
      field(:review_id, String.t())
      field(:selections, list(String.t()))
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :rename_review do
    payload do
      field(:review_id, String.t())
      field(:name, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :delete_review do
    payload do
      field(:review_id, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :list_dir do
    payload do
      field(:project_id, String.t())
      field(:path, String.t())
    end

    reply do
      field(:entries, list(%{path: String.t(), dir: boolean()}))
    end
  end

  command :list_review_files do
    payload do
      field(:review_id, String.t())
    end

    reply do
      field(:files, list(%{path: String.t(), artifact_id: String.t() | nil, approved: boolean()}))
      field(:error, String.t() | nil)
    end
  end

  command :open_review_file do
    payload do
      field(:review_id, String.t())
      field(:path, String.t())
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(_params, socket), do: {:ok, socket}

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(_socket) do
    %{projects: Enum.map(Projects.list_projects(), &render_project/1)}
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:create_project, payload, socket) do
    case Projects.register_project(%{name: payload["name"], path: payload["path"]}) do
      {:ok, %Project{} = project} ->
        {:reply, %{project_id: project.id, error: nil}, touch(socket)}

      {:error, reason} ->
        {:reply, %{project_id: nil, error: project_error(reason)}, socket}
    end
  end

  def handle_command(:create_review, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> create_review(project, payload)
        nil -> %{review_id: nil, error: "project_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:create_diff_review, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> create_diff_review(project, payload)
        nil -> %{review_id: nil, error: "project_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:list_branches, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> list_branches(project)
        nil -> branches_reply([], nil, "project_not_found")
      end

    {:reply, reply, socket}
  end

  def handle_command(:update_review_files, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> update_review_files(review, payload["selections"])
        nil -> %{error: "review_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:rename_review, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> rename_review(review, payload["name"])
        nil -> %{error: "review_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:delete_review, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> delete_review(review)
        nil -> %{error: "review_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  # On-demand directory scan: one level at a time, kept off render so neither the
  # board's first snapshot nor opening the picker blocks on walking a whole
  # working directory (see docs/musubi-issues.md).
  def handle_command(:list_dir, payload, socket) do
    entries =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> Projects.list_dir(project, payload["path"])
        nil -> []
      end

    {:reply, %{entries: entries}, socket}
  end

  # Expands a review's selection against disk on demand (only when its files are
  # revealed), so the board's render never walks a working directory.
  def handle_command(:list_review_files, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> %{files: Reviews.list_files(review), error: nil}
        nil -> %{files: [], error: "review_not_found"}
      end

    {:reply, reply, socket}
  end

  def handle_command(:open_review_file, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> open_review_file(review, payload["path"])
        nil -> %{artifact_id: nil, error: "review_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  # The render derives entirely from the database; a mutation that does not touch
  # assigns would reuse the cached render and push no patch (see
  # docs/musubi-issues.md ISSUE-1). Bump a render-irrelevant assign so another
  # client viewing the board sees the change.
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())

  defp create_review(project, payload) do
    params = %{name: payload["name"], selections: payload["selections"]}

    case Reviews.create_review(project, params) do
      {:ok, %Review{} = review} -> %{review_id: review.id, error: nil}
      {:error, reason} -> %{review_id: nil, error: review_error(reason)}
    end
  end

  defp create_diff_review(project, payload) do
    params = %{
      name: payload["name"],
      base_ref: payload["base_ref"],
      head_ref: payload["head_ref"]
    }

    case Reviews.create_diff_review(project, params) do
      {:ok, %Review{} = review} -> %{review_id: review.id, error: nil}
      {:error, reason} -> %{review_id: nil, error: review_error(reason)}
    end
  end

  defp list_branches(project) do
    case Reviews.list_branches(project) do
      {:ok, %{branches: branches, default: default}} -> branches_reply(branches, default, nil)
      {:error, reason} -> branches_reply([], nil, review_error(reason))
    end
  end

  defp branches_reply(branches, default, error) do
    %{branches: branches, default: default, error: error}
  end

  defp update_review_files(review, selections) do
    {:ok, %Review{}} = Reviews.set_selection(review, selections)
    %{error: nil}
  end

  defp open_review_file(review, path) do
    case Reviews.open_file(review, path) do
      {:ok, artifact} -> %{artifact_id: artifact.id, error: nil}
      {:error, reason} -> %{artifact_id: nil, error: review_error(reason)}
    end
  end

  defp rename_review(review, name) do
    case Reviews.rename_review(review, name) do
      {:ok, %Review{}} -> %{error: nil}
      {:error, reason} -> %{error: review_error(reason)}
    end
  end

  defp delete_review(review) do
    case Reviews.delete_review(review) do
      {:ok, %Review{}} -> %{error: nil}
      {:error, reason} -> %{error: review_error(reason)}
    end
  end

  defp project_error(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp project_error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end

  defp review_error(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp review_error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end

  defp render_project(%Project{} = project) do
    %{
      id: project.id,
      name: project.name,
      path: project.path,
      reviews: Enum.map(Reviews.list_for_project(project), &render_review/1)
    }
  end

  defp render_review(%Review{source: %FileSelection{selection_paths: paths}} = review) do
    %{
      id: review.id,
      name: review.name,
      inserted_at: Iso8601.utc(review.inserted_at),
      selections: paths,
      selection_count: length(paths)
    }
  end

  # A git-diff review's reviewer-facing "selection" is the diff between two
  # refs, not a path list. The board only needs the review id/name/inserted_at
  # to render a card; Phase 10 will add refs + kind to the picker view.
  defp render_review(%Review{source: %GitDiff{}} = review) do
    %{
      id: review.id,
      name: review.name,
      inserted_at: Iso8601.utc(review.inserted_at),
      selections: [],
      selection_count: 0
    }
  end
end
