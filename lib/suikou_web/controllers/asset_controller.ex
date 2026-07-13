defmodule SuikouWeb.AssetController do
  @moduledoc """
  Serves an artifact's own reviewed content and the files its markdown
  references (images and the like), reading them live from the artifact's
  project directory. References are resolved and bounds-checked by
  `Suikou.Artifacts`; anything that can't be resolved answers 404. A
  file-selection artifact streams its source file with its own media type; a
  git-diff artifact streams the live unified diff inline as `text/x-diff`.

  Also lists a diff review's commit range as JSON so the frontend can drive
  commit-by-commit navigation without a store round-trip (batch data over HTTP,
  keeping the realtime store to comments and counters).
  """

  use SuikouWeb, :controller

  alias Suikou.Artifacts
  alias Suikou.Reviews
  alias Suikou.Schemas.Review

  @doc """
  Sends the file an artifact's markdown references at `path`, or 404 when it
  can't be resolved to a regular file inside the artifact's project.

  ## Examples

      get(conn, "/api/review/0192.../asset/img/diagram.png")
      #=> 200, image/png

  """
  @spec show(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def show(conn, %{"artifact_id" => artifact_id, "path" => segments}) do
    case Artifacts.resolve_asset(artifact_id, Path.join(segments)) do
      {:ok, absolute} -> serve_content(conn, {:file, absolute})
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  @doc """
  Sends an artifact's reviewed content live: a file-selection artifact answers
  the file's bytes with its own media type; a git-diff artifact answers the
  live unified diff inline as `text/x-diff`. 404 when the source can't be
  resolved or read.

  ## Examples

      get(conn, "/api/review/0192.../content")
      #=> 200, text/markdown

      get(conn, "/api/review/0193.../content")
      #=> 200, text/x-diff

  """
  @spec content(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def content(conn, %{"artifact_id" => artifact_id}) do
    case Artifacts.content_source(artifact_id) do
      {:ok, source} -> serve_content(conn, source)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  @doc """
  Sends a review file's reviewed content live, looked up by path inside the
  review without minting an artifact. A file-selection review streams the
  on-disk bytes with the file's own media type; a git-diff review streams
  the live unified diff inline as `text/x-diff`. The response shape matches
  `/api/review/:artifact_id/content` so the same frontend renderer handles
  both routes.

  The `path` query string is whitelisted against `Suikou.Reviews.list_files/1`
  for `review_id`; anything outside the review's current file set, an
  unsafe path, or an unreadable source answers 404.

  ## Examples

      get(conn, "/api/review/0192.../files/content?path=docs/plan.md")
      #=> 200, text/markdown

      get(conn, "/api/review/0192.../files/content?path=../secret")
      #=> 404

  """
  @spec file_content(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def file_content(conn, %{"review_id" => review_id, "path" => path} = params)
      when is_binary(path) and path != "" do
    case parse_lens(params) do
      {:ok, lens} ->
        case Reviews.get_review(review_id) do
          %Review{} = review -> serve_review_path(conn, review, path, lens)
          nil -> send_resp(conn, 404, "")
        end

      {:error, :invalid_scope_worktree_combination} ->
        send_resp(conn, 400, "")

      {:error, _reason} ->
        send_resp(conn, 400, "")
    end
  end

  def file_content(conn, _params), do: send_resp(conn, 404, "")

  @doc """
  Sends a review file's raw bytes by path without minting an artifact, used by
  the review surface to preview images (and other binary files) in "all files"
  mode regardless of review type. A file-selection review streams the on-disk
  bytes; a git-diff review streams the file's bytes at the review's head ref,
  with a media type derived from the path's extension. Same whitelist as
  `/files/content` — anything outside the review's current file set, an
  unsafe path, or an unreadable source answers 404.

  ## Examples

      get(conn, "/api/review/0192.../files/raw?path=img/logo.png")
      #=> 200, image/png

      get(conn, "/api/review/0192.../files/raw?path=../secret")
      #=> 404

  """
  @spec file_raw(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def file_raw(conn, %{"review_id" => review_id, "path" => path})
      when is_binary(path) and path != "" do
    case Reviews.get_review(review_id) do
      %Review{} = review -> serve_review_raw(conn, review, path)
      nil -> send_resp(conn, 404, "")
    end
  end

  def file_raw(conn, _params), do: send_resp(conn, 404, "")

  @doc """
  Lists a diff review's commit range (three-dot `base_ref...head_ref`), newest
  first, as JSON `{"commits": [{"sha", "subject"}]}`. Answers 404 for a
  file-selection review, an unknown review, or a git error (deleted ref,
  invalid ref, non-repo project) — the review chrome already surfaces the
  branch-deleted state via `refs_snapshot/1` (`refs_valid: false`), so this
  endpoint stays a plain read.

  ## Examples

      get(conn, "/api/review/0192.../commits")
      #=> 200, {"commits": [{"sha": "0a1b...", "subject": "second"}]}

      get(conn, "/api/review/<file-selection-review>/commits")
      #=> 404

  """
  @spec commits(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def commits(conn, %{"review_id" => review_id}) do
    with %Review{} = review <- Reviews.get_review(review_id),
         {:ok, entries} <- Reviews.list_diff_commits(review) do
      json(conn, %{commits: entries})
    else
      _error -> send_resp(conn, 404, "")
    end
  end

  @doc """
  Lists a review's files under the given scope × worktree lens, as JSON:
  `{"files": [{path, change_status, added, deleted, verdict, approved,
  soft_removed, artifact_id, content_hash}]}`. Powers the file navigator's
  scope-aware refresh (BDR-0025): when the reviewer switches scope or worktree,
  the navigator refetches from here instead of the static
  `load_review_structure` payload. 404 for an unknown review or invalid lens
  keyword; 400 for an invalid scope × worktree combination.
  """
  @spec files(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def files(conn, %{"review_id" => review_id} = params) do
    case parse_lens(params) do
      {:ok, lens} ->
        case Reviews.get_review(review_id) do
          %Review{} = review -> json(conn, %{files: Reviews.list_files(review, lens)})
          nil -> send_resp(conn, 404, "")
        end

      {:error, :invalid_scope_worktree_combination} ->
        send_resp(conn, 400, "")

      {:error, _reason} ->
        send_resp(conn, 400, "")
    end
  end

  defp serve_review_path(conn, %Review{} = review, path, lens) do
    case Reviews.fetch_content_by_path(review, path, lens) do
      {:ok, source} ->
        serve_content(conn, source)

      {:error, :invalid_scope_worktree_combination} ->
        send_resp(conn, 400, "")

      {:error, _reason} ->
        send_resp(conn, 404, "")
    end
  end

  # `?scope=all` (default) | `?scope=commits:<sha>[,<sha>...]` | `?worktree=diff`
  # (default) | `?worktree=staged` | `?worktree=unstaged`. Missing keys keep the
  # pinned `base_ref...head_ref` diff (BDR-0024 default lens). `commits` carries
  # a newest-first hex SHA list (each 4-64 hex chars), matching
  # `Suikou.Reviews.list_diff_commits/1`'s order.
  defp parse_lens(params) do
    with {:ok, scope} <- parse_scope(Map.get(params, "scope")),
         {:ok, worktree} <- parse_worktree(Map.get(params, "worktree")) do
      lens =
        %{}
        |> maybe_put(:scope, scope, :all)
        |> maybe_put(:worktree, worktree, :diff)

      if match?({:commits, [_first | _rest]}, scope) and worktree in [:staged, :unstaged] do
        {:error, :invalid_scope_worktree_combination}
      else
        {:ok, lens}
      end
    end
  end

  defp parse_scope(nil), do: {:ok, :all}
  defp parse_scope("all"), do: {:ok, :all}

  defp parse_scope("commits:" <> rest) when byte_size(rest) > 0 do
    shas = String.split(rest, ",", trim: true)

    if shas != [] and Enum.all?(shas, &(&1 =~ ~r/^[a-f0-9]{4,64}$/i)),
      do: {:ok, {:commits, Enum.map(shas, &String.downcase/1)}},
      else: {:error, :invalid_scope}
  end

  defp parse_scope(_other), do: {:error, :invalid_scope}

  defp parse_worktree(nil), do: {:ok, :diff}
  defp parse_worktree("diff"), do: {:ok, :diff}
  defp parse_worktree("staged"), do: {:ok, :staged}
  defp parse_worktree("unstaged"), do: {:ok, :unstaged}
  defp parse_worktree(_other), do: {:error, :invalid_worktree}

  defp maybe_put(map, _key, default, default), do: map
  defp maybe_put(map, key, value, _default), do: Map.put(map, key, value)

  defp serve_review_raw(conn, %Review{} = review, path) do
    case Reviews.fetch_raw_by_path(review, path) do
      {:ok, source} -> serve_content(conn, source)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  # Every served file (reviewed text, inline diff, image, raw blob) answers with
  # a strong ETag = hash of the exact bytes sent. The frontend keys its highlight
  # cache off this for text and lets the browser revalidate images by it; either
  # way the identity tracks the real content, not the round's stored hash, which
  # can lag a live edit. `no-cache` forces revalidation (the URL isn't
  # content-stamped); an unchanged file then answers 304.
  # ponytail: reads the whole file into memory to hash it — fine for review-sized
  # assets; stream-hash + send_file if a large-blob route ever needs it.
  defp serve_content(conn, {:file, absolute}) do
    case File.read(absolute) do
      {:ok, bytes} -> send_content(conn, bytes, MIME.from_path(absolute))
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  defp serve_content(conn, {:inline, bytes, content_type}) do
    send_content(conn, bytes, content_type)
  end

  defp send_content(conn, bytes, content_type) do
    etag = ~s("#{Base.encode16(:crypto.hash(:sha256, bytes), case: :lower)}")

    conn =
      conn
      |> put_resp_content_type(content_type, nil)
      |> put_resp_header("etag", etag)
      |> put_resp_header("cache-control", "no-cache")

    if etag in get_req_header(conn, "if-none-match") do
      send_resp(conn, 304, "")
    else
      send_resp(conn, 200, bytes)
    end
  end
end
