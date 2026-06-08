defmodule Suikou.Critique.Reanchor do
  @moduledoc """
  Re-anchors a draft round's line-scoped comments in place when its content
  snapshot is refreshed from disk (see BDR-0018). Each comment's line range is
  mapped through the old-to-new line diff (BDR-0017): an unchanged line moves to
  its new position, an edited or deleted line marks the comment outdated. An
  already-outdated comment keeps its stale anchor.
  """

  import Ecto.Query

  alias Suikou.Critique.Anchor
  alias Suikou.Repo
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Comment

  @doc """
  Re-anchors every line-scoped, non-outdated comment on `round_id` from
  `prev_content` to `new_content`. Runs inside the re-snapshot transaction.

  ## Examples

      Suikou.Critique.Reanchor.reanchor_round(round.id, "a\\nb\\n", "x\\na\\nb\\n")
      #=> :ok

  """
  @spec reanchor_round(Ecto.UUID.t(), String.t(), String.t()) :: :ok
  def reanchor_round(round_id, prev_content, new_content) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.round_id == ^round_id and c.scope == :line and c.outdated == false)
    |> Repo.all()
    |> Enum.each(&reanchor_one(&1, prev_content, new_content))
  end

  defp reanchor_one(%Comment{anchor: %LineRange{} = anchor} = comment, prev_content, new_content) do
    case Anchor.reanchor(prev_content, new_content, anchor) do
      {:ok, new_anchor} -> apply_anchor(comment, new_anchor)
      :outdated -> mark_outdated(comment)
    end
  end

  defp reanchor_one(_comment, _prev_content, _new_content), do: :ok

  defp apply_anchor(comment, %LineRange{} = anchor) do
    params = %{
      __type__: "line_range",
      start_line: anchor.start_line,
      end_line: anchor.end_line,
      quote: anchor.quote
    }

    comment
    |> Comment.relocate_changeset(%{anchor: params})
    |> Repo.update!()
  end

  defp mark_outdated(comment) do
    comment
    |> Ecto.Changeset.change(outdated: true)
    |> Repo.update!()
  end
end
