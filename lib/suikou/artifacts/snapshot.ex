defmodule Suikou.Artifacts.Snapshot do
  @moduledoc """
  Shared round-zero mint and resnapshot orchestration used by the artifact
  source types (`Suikou.Artifacts.FileSource`, `Suikou.Artifacts.DiffSource`).
  Both sources read live content (file bytes or diff text) and persist only
  its SHA-256 hash on the round; this module owns the artifact insert, the
  round-0 insert, and the resnapshot-by-fetch flow so the shape lives in one
  place rather than being cloned across the source modules.
  """

  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round

  @type fetch_content_error() ::
          :not_a_file | :empty_content | :not_a_git_repo | :git_error | :not_changed

  @doc """
  Inserts a fresh artifact under `review` at `file_path` together with its
  round 0, whose `content_hash` is `hash(content)`. Called inside a
  `Repo.transaction/1` by each source so the pair lands atomically.

  ## Examples

      Suikou.Artifacts.Snapshot.mint!(review, "docs/plan.md", "# Plan\\n")
      #=> %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}

  """
  @spec mint!(Review.t(), String.t(), binary()) :: %{
          artifact: Artifact.t(),
          round: Round.t()
        }
  def mint!(%Review{} = review, file_path, content)
      when is_binary(file_path) and is_binary(content) do
    artifact =
      review
      |> Artifact.create_from_file_changeset(%{title: file_path, file_path: file_path})
      |> Repo.insert!()

    round =
      %{artifact_id: artifact.id, number: 0, content_hash: hash(content)}
      |> Round.changeset()
      |> Repo.insert!()

    %{artifact: artifact, round: round}
  end

  @doc """
  Refreshes the draft round's `content_hash` by calling `fetch_content` against
  the round's artifact (preloaded with `review: :project` so a source can read
  whatever live bytes it needs). Only the latest round may be resnapshotted.

  Returns `{:error, :round_not_found}` for an unknown round,
  `{:error, :not_latest_round}` for a superseded one, and surfaces the
  source-specific fetch error unchanged.

  ## Examples

      Suikou.Artifacts.Snapshot.resnapshot(round.id, &Suikou.Artifacts.FileSource.read/1)
      #=> {:ok, %Suikou.Schemas.Round{number: 1}}

  """
  @spec resnapshot(
          Ecto.UUID.t(),
          (Artifact.t() -> {:ok, binary()} | {:error, fetch_content_error()})
        ) ::
          {:ok, Round.t()}
          | {:error, :round_not_found | :not_latest_round | fetch_content_error()}
  def resnapshot(round_id, fetch_content) when is_function(fetch_content, 1) do
    with {:ok, round} <- fetch_latest_round(round_id),
         artifact = preload_artifact(round),
         {:ok, content} <- fetch_content.(artifact) do
      {:ok,
       round
       |> Round.resnapshot_changeset(%{content_hash: hash(content)})
       |> Repo.update!()}
    end
  end

  defp hash(content), do: Base.encode16(:crypto.hash(:sha256, content))

  defp fetch_latest_round(round_id) do
    case Rounds.get(round_id) do
      nil ->
        {:error, :round_not_found}

      %Round{} = round ->
        if Rounds.latest?(round), do: {:ok, round}, else: {:error, :not_latest_round}
    end
  end

  defp preload_artifact(%Round{} = round) do
    Repo.preload(Repo.get!(Artifact, round.artifact_id), review: :project)
  end
end
