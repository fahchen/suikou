defmodule Suikou.Factories.ReviewFactory do
  @moduledoc false

  defmacro __using__(_opts) do
    quote do
      alias Suikou.Artifacts
      alias Suikou.Critique
      alias Suikou.Repo
      alias Suikou.Review
      alias Suikou.Schemas.Artifact
      alias Suikou.Schemas.Comment
      alias Suikou.Schemas.Round

      def artifact_factory do
        %Artifact{title: sequence(:title, &"Artifact #{&1}")}
      end

      def round_factory do
        %Round{
          number: 1,
          content: "line 1\nline 2\nline 3\n",
          content_hash: fn round -> Base.encode16(:crypto.hash(:sha256, round.content)) end,
          artifact: build(:artifact)
        }
      end

      def comment_factory do
        %{scope: :review, critique_type: :note, body: "please clarify"}
      end

      def advance(artifact_id, content) do
        {:ok, result} = Artifacts.submit(%{artifact_id: artifact_id, content: content})
        result
      end

      def pending_comment(round_id, params \\ %{}) do
        {:ok, comment} =
          :comment
          |> build(params)
          |> Map.put(:round_id, round_id)
          |> Critique.add_comment()

        comment
      end

      def published_comment(round_id, params \\ %{}, verdict \\ :comment) do
        comment = pending_comment(round_id, params)
        {:ok, _review} = Review.submit_review(round_id, verdict)
        Repo.get!(Comment, comment.id)
      end
    end
  end
end
