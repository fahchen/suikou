defmodule Suikou.Reviews.Artifacts.Submission do
  @moduledoc """
  Agent submission and automatic round bumping. A first submission mints an
  artifact and its round 1 snapshot. A resubmission under the same artifact id
  advances the round only when the content hash differs (see BDR-0001); the
  advance carries unresolved published critique forward and clears approval.
  """

  alias Suikou.Repo
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Rounds.CarryForward
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Round

  @type result :: %{artifact: Artifact.t(), round: Round.t(), bumped: boolean()}

  @doc """
  Submits artifact content. Without an `:artifact_id` it mints a new artifact at
  round 1. With one it advances the round only when the content hash differs,
  carrying unresolved published critique forward and clearing approval; identical
  content is idempotent (`bumped: false`).

  ## Examples

      Suikou.Reviews.Artifacts.Submission.submit(%{title: "Draft", content: "hello\\n"})
      #=> {:ok, %{artifact: %Suikou.Reviews.Schemas.Artifact{}, round: %Suikou.Reviews.Schemas.Round{number: 1}, bumped: true}}

      Suikou.Reviews.Artifacts.Submission.submit(%{artifact_id: artifact.id, content: "hello\\n"})
      #=> {:ok, %{bumped: false}}

      Suikou.Reviews.Artifacts.Submission.submit(%{title: "Draft", content: "   "})
      #=> {:error, :empty_content}

  """
  @spec submit(map()) :: {:ok, result()} | {:error, Ecto.Changeset.t() | :empty_content}
  def submit(params) do
    case params[:artifact_id] && Repo.get(Artifact, params[:artifact_id]) do
      nil -> create_new(params)
      %Artifact{} = artifact -> resubmit(artifact, params)
    end
  end

  defp create_new(params) do
    content = params[:content]
    changeset = Artifact.create_changeset(params)

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

  defp resubmit(artifact, params) do
    content = params[:content]
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
    CarryForward.carry(latest, new_round)
    artifact = artifact |> Artifact.clear_approval_changeset() |> Repo.update!()
    result(artifact, new_round, true)
  end

  defp result(artifact, round, bumped), do: %{artifact: artifact, round: round, bumped: bumped}

  defp insert_round!(artifact_id, number, content) do
    %{artifact_id: artifact_id, number: number, content: content, content_hash: hash(content)}
    |> Round.changeset()
    |> Repo.insert!()
  end

  defp hash(content), do: Base.encode16(:crypto.hash(:sha256, content))

  defp blank?(nil), do: true
  defp blank?(content), do: String.trim(content) == ""
end
