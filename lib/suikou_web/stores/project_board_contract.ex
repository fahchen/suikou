defmodule SuikouWeb.Stores.ProjectBoardContract do
  @moduledoc """
  Shared Musubi schema fragments for project board snapshots and replies.
  """

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
