defmodule Suikou.ReviewFixtures do
  @moduledoc """
  Test fixtures for the review domains. Centralized here so test modules share
  one set of builders rather than duplicating setup (ex_dna clone budget is 0).
  """

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Review

  @doc "Submits a fresh artifact and returns `%{artifact:, round:}`."
  def artifact_fixture(attrs \\ %{}) do
    attrs =
      Enum.into(attrs, %{title: "Auth rollout plan", content: "line 1\nline 2\nline 3\n"})

    {:ok, result} = Artifacts.submit(attrs)
    result
  end

  @doc "Resubmits new content under an artifact id, advancing the round."
  def advance(artifact_id, content) do
    {:ok, result} = Artifacts.submit(%{artifact_id: artifact_id, content: content})
    result
  end

  @doc "Adds a pending comment on the given round; returns the comment."
  def pending_comment(round_id, attrs \\ %{}) do
    attrs =
      Enum.into(attrs, %{
        round_id: round_id,
        scope: :review,
        critique_type: :note,
        body: "please clarify"
      })

    {:ok, comment} = Critique.add_comment(attrs)
    comment
  end

  @doc """
  Adds a comment on `round_id` and publishes it by submitting a review with the
  given verdict. Returns the reloaded published comment.
  """
  def published_comment(round_id, attrs \\ %{}, verdict \\ :comment) do
    comment = pending_comment(round_id, attrs)
    {:ok, _review} = Review.submit_review(round_id, verdict)
    Suikou.Repo.get!(Suikou.Schemas.Comment, comment.id)
  end
end
