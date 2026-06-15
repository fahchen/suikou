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

  defp review_file_type_ast do
    quote do
      %{
        path: String.t(),
        artifact_id: String.t() | nil,
        approved: boolean(),
        content_hash: String.t() | nil,
        change_status: :added | :modified | :deleted | :renamed | :copied | :type_changed | nil
      }
    end
  end
end
