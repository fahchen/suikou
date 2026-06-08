defmodule Suikou.Factories.ReviewFactory do
  @moduledoc false

  defmacro __using__(_opts) do
    quote do
      alias Suikou.Artifacts
      alias Suikou.Critique
      alias Suikou.Repo
      alias Suikou.Review
      alias Suikou.Rounds
      alias Suikou.Schemas.Artifact
      alias Suikou.Schemas.Comment
      alias Suikou.Schemas.Project
      alias Suikou.Schemas.Round

      def artifact_factory do
        %Artifact{
          title: sequence(:title, &"Artifact #{&1}"),
          file_path: "doc.md",
          project: build(:project)
        }
      end

      def project_factory do
        %Project{
          name: sequence(:name, &"Project #{&1}"),
          path: sequence(:path, &Path.join(System.tmp_dir!(), "suikou-project-#{&1}"))
        }
      end

      def round_factory do
        %Round{
          number: 0,
          content: "line 1\nline 2\nline 3\n",
          content_hash: fn round -> Base.encode16(:crypto.hash(:sha256, round.content)) end,
          artifact: build(:artifact)
        }
      end

      def comment_factory do
        %{scope: :review, critique_type: :note, body: "please clarify"}
      end

      # Advances an artifact one round: submits the latest round (copying content
      # forward and carrying unresolved published critique), writes `content` to
      # the artifact's file on disk, then re-snapshots the new draft round so its
      # content and carried line anchors reflect the change.
      def advance(artifact_id, content, verdict \\ :comment) do
        latest = Rounds.latest(artifact_id)
        {:ok, %{next_round: next}} = Review.submit_review(latest.id, verdict)
        write_source(artifact_id, content)
        {:ok, round} = Artifacts.resnapshot(next.id)
        %{round: round}
      end

      # Pulls an agent edit into the latest draft round without submitting: writes
      # `content` to the artifact's file on disk, then re-snapshots the draft so
      # its content and carried line anchors reflect the change.
      def edit_round(artifact_id, content) do
        write_source(artifact_id, content)
        latest = Rounds.latest(artifact_id)
        {:ok, round} = Artifacts.resnapshot(latest.id)
        round
      end

      defp write_source(artifact_id, content) do
        artifact = Artifact |> Repo.get!(artifact_id) |> Repo.preload(:project)
        path = Path.join(artifact.project.path, artifact.file_path)
        File.mkdir_p!(Path.dirname(path))
        File.write!(path, content)
      end

      def pending_comment(round_id, params \\ %{}) do
        {:ok, comment} =
          :comment
          |> build(params)
          |> Map.put(:round_id, round_id)
          |> Critique.add_comment()

        comment
      end

      def published_comment(round_id, params \\ %{}) do
        round_id
        |> pending_comment(params)
        |> Ecto.Changeset.change(status: :published)
        |> Repo.update!()
      end
    end
  end
end
