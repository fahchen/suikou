defmodule SuikouWeb.Stores.ProjectBoardContract do
  @moduledoc """
  Shared Musubi schema fragments for project board snapshots and replies.
  """

  @doc """
  Declares the `projects` field shared by the board snapshot and the `load_board`
  reply: every project with its review summaries.
  """
  defmacro projects_field(name \\ :projects) do
    quote do
      field(unquote(name), unquote(projects_type_ast()))
    end
  end

  @doc """
  Declares the grouped review-files reply field used by `load_board`: the same
  `review_id => files` rows as the async board field, but a plain list (the reply
  carries the resolved value, never a loading state).
  """
  defmacro review_files_grouped_field(name \\ :review_files) do
    quote do
      field(
        unquote(name),
        list(%{
          review_id: String.t(),
          files: list(unquote(review_file_type_ast()))
        })
      )
    end
  end

  @doc """
  Declares the async review-files state field used by the project board store.
  """
  defmacro review_files_state_field(name \\ :review_files) do
    quote do
      field(
        unquote(name),
        Musubi.AsyncResult.of(
          list(%{
            review_id: String.t(),
            files: list(unquote(review_file_type_ast()))
          })
        )
      )
    end
  end

  @doc """
  Declares the review-files reply field used by the project board store.
  """
  defmacro review_files_reply_field(name \\ :files) do
    quote do
      field(
        unquote(name),
        list(unquote(review_file_type_ast()))
      )
    end
  end

  @doc """
  Declares a flat async review-files field: the same file-row shape, as a single
  `AsyncResult` list (the review store's `file_entries`, ungrouped).
  """
  defmacro review_files_async_field(name) do
    quote do
      field(
        unquote(name),
        Musubi.AsyncResult.of(list(unquote(review_file_type_ast())))
      )
    end
  end

  defp projects_type_ast do
    quote do
      list(%{
        id: String.t(),
        name: String.t(),
        path: String.t(),
        respect_gitignore: boolean(),
        reviews:
          list(%{
            id: String.t(),
            name: String.t(),
            inserted_at: String.t(),
            kind: :file_selection | :git_diff,
            selections: list(String.t()),
            base_ref: String.t() | nil,
            head_ref: String.t() | nil,
            base_sha: String.t() | nil,
            head_sha: String.t() | nil,
            creation_base_sha: String.t() | nil,
            creation_head_sha: String.t() | nil,
            refs_moved: boolean()
          })
      })
    end
  end

  defp review_file_type_ast do
    quote do
      %{
        path: String.t(),
        artifact_id: String.t() | nil,
        approved: boolean(),
        verdict: :approve | :request_changes | :comment | nil,
        content_hash: String.t() | nil,
        change_status: :added | :modified | :deleted | :renamed | :copied | :type_changed | nil
      }
    end
  end
end
