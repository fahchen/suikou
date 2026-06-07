defmodule Suikou.Reviews.Submission do
  @moduledoc """
  Agent submission and automatic round bumping. A first submission mints an
  artifact and its round 1 snapshot. A resubmission under the same artifact id
  advances the round only when the content hash differs (see BDR-0001); the
  advance carries unresolved published critique forward and clears approval.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Anchor
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Round

  @type result :: %{artifact: Artifact.t(), round: Round.t(), bumped: boolean()}

  @doc """
  Submits artifact content. Without an `:artifact_id` it mints a new artifact at
  round 1. With one it advances the round only when the content hash differs,
  carrying unresolved published critique forward and clearing approval; identical
  content is idempotent (`bumped: false`).

  ## Examples

      Suikou.Reviews.Submission.submit(%{title: "Draft", content: "hello\\n"})
      #=> {:ok, %{artifact: %Suikou.Reviews.Schemas.Artifact{}, round: %Suikou.Reviews.Schemas.Round{number: 1}, bumped: true}}

      Suikou.Reviews.Submission.submit(%{artifact_id: artifact.id, content: "hello\\n"})
      #=> {:ok, %{bumped: false}}

      Suikou.Reviews.Submission.submit(%{title: "Draft", content: "   "})
      #=> {:error, :empty_content}

  """
  @spec submit(map()) :: {:ok, result()} | {:error, Ecto.Changeset.t() | :empty_content}
  def submit(attrs) do
    case attrs[:artifact_id] && Repo.get(Artifact, attrs[:artifact_id]) do
      nil -> create_new(attrs)
      %Artifact{} = artifact -> resubmit(artifact, attrs)
    end
  end

  defp create_new(attrs) do
    content = attrs[:content]
    changeset = Artifact.create_changeset(attrs)

    cond do
      blank?(content) -> {:error, :empty_content}
      not changeset.valid? -> {:error, changeset}
      true -> Repo.transaction(fn -> insert_first(changeset, content) end)
    end
  end

  defp insert_first(changeset, content) do
    artifact = Repo.insert!(changeset)
    round = insert_round!(artifact.id, 1, content)
    result(artifact, round, true)
  end

  defp resubmit(artifact, attrs) do
    content = attrs[:content]
    latest = Rounds.latest(artifact.id)

    cond do
      blank?(content) ->
        {:error, :empty_content}

      hash(content) == latest.content_hash ->
        {:ok, result(artifact, latest, false)}

      true ->
        Repo.transaction(fn -> advance(artifact, latest, content) end)
    end
  end

  defp advance(artifact, latest, content) do
    new_round = insert_round!(artifact.id, latest.number + 1, content)
    carry_forward(latest, new_round)
    artifact = artifact |> Ecto.Changeset.change(approved_round: nil) |> Repo.update!()
    result(artifact, new_round, true)
  end

  defp result(artifact, round, bumped), do: %{artifact: artifact, round: round, bumped: bumped}

  defp insert_round!(artifact_id, number, content) do
    %{artifact_id: artifact_id, number: number, content: content, content_hash: hash(content)}
    |> Round.changeset()
    |> Repo.insert!()
  end

  defp carry_forward(prev_round, new_round) do
    Comment
    |> where(
      [c],
      c.round_id == ^prev_round.id and c.status == :published and is_nil(c.resolved_round)
    )
    |> Repo.all()
    |> Enum.each(&carry_one(&1, new_round))
  end

  defp carry_one(comment, new_round) do
    {start_line, end_line, outdated} = relocate(comment, new_round.content)

    Repo.insert!(%Comment{
      round_id: new_round.id,
      origin_id: comment.id,
      scope: comment.scope,
      start_line: start_line,
      end_line: end_line,
      quote: comment.quote,
      critique_type: comment.critique_type,
      body: comment.body,
      status: :published,
      outdated: outdated
    })
  end

  defp relocate(%Comment{scope: :line, quote: quote}, content) when is_binary(quote) do
    case Anchor.reanchor(content, quote) do
      {start_line, end_line} -> {start_line, end_line, false}
      nil -> {nil, nil, true}
    end
  end

  defp relocate(_comment, _content), do: {nil, nil, false}

  defp hash(content), do: Base.encode16(:crypto.hash(:sha256, content))

  defp blank?(nil), do: true
  defp blank?(content), do: String.trim(content) == ""
end
