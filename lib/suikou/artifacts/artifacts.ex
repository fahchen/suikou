defmodule Suikou.Artifacts do
  @moduledoc """
  Public API for the artifacts domain: agent submission and automatic round
  bumping. A first submission mints an artifact and its round 1 snapshot; a
  resubmission advances the round only when content changes, carrying unresolved
  published critique forward and clearing approval.

  This facade is the only module other layers may call; its internal
  submodules are reachable only from within the domain.
  """

  alias Suikou.Artifacts.FileSource
  alias Suikou.Artifacts.Submission

  @doc """
  Submits artifact content, minting or advancing a round. See
  `Suikou.Artifacts.Submission.submit/1`.

  ## Examples

      Suikou.Artifacts.submit(%{title: "Draft", content: "hello\\n"})
      #=> {:ok, %{round: %Suikou.Schemas.Round{number: 1}, bumped: true}}

  """
  defdelegate submit(params), to: Submission

  @doc """
  Creates an artifact at round 0 from a file selected under a project. See
  `Suikou.Artifacts.FileSource.create/2`.

  ## Examples

      Suikou.Artifacts.create_from_file(project, "docs/plan.md")
      #=> {:ok, %{artifact: %Suikou.Schemas.Artifact{}, round: %Suikou.Schemas.Round{number: 0}}}

  """
  defdelegate create_from_file(project, file_path), to: FileSource, as: :create
end
