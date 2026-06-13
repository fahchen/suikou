defmodule Suikou.Factories.ReviewFactory do
  @moduledoc false

  defmacro __using__(_opts) do
    quote do
      alias Suikou.Artifacts
      alias Suikou.Critique
      alias Suikou.Repo
      alias Suikou.Rounds
      alias Suikou.Schemas.Artifact
      alias Suikou.Schemas.Comment
      alias Suikou.Schemas.Project
      alias Suikou.Schemas.Review
      alias Suikou.Schemas.ReviewSource.FileSelection
      alias Suikou.Schemas.Round
      alias Suikou.Submissions

      def artifact_factory do
        %Artifact{
          title: sequence(:title, &"Artifact #{&1}"),
          file_path: "doc.md",
          review: build(:review)
        }
      end

      def review_factory do
        %Review{
          name: sequence(:name, &"Review #{&1}"),
          project: build(:project),
          source: %FileSelection{selection_paths: []}
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
          content_hash: sequence(:content_hash, &"HASH#{&1}"),
          artifact: build(:artifact)
        }
      end

      # Round 0 for a fresh artifact under an existing review, so several files
      # can be wired to the same review without ExMachina re-inserting it.
      def round_in_review(review) do
        review
        |> Ecto.build_assoc(:artifacts,
          title: sequence(:title, &"Artifact #{&1}"),
          file_path: sequence(:file_path, &"doc-#{&1}.md")
        )
        |> Repo.insert!()
        |> Ecto.build_assoc(:rounds,
          number: 0,
          content_hash: sequence(:content_hash, &"HASH#{&1}")
        )
        |> Repo.insert!()
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
        {:ok, %{next_round: next}} = Submissions.submit(latest.id, verdict)
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

      # Round 0 for a fresh artifact, with `content` written to its file on disk
      # (the source of truth for live reads and quote capture).
      def source_round(content) do
        round = insert(:round, content_hash: Base.encode16(:crypto.hash(:sha256, content)))
        write_source(round.artifact_id, content)
        round
      end

      # Overwrites the artifact's file on disk without touching its round, to
      # exercise live content reads and anchor resolution against a changed file.
      def rewrite_source(artifact_id, content), do: write_source(artifact_id, content)

      defp write_source(artifact_id, content) do
        artifact = Artifact |> Repo.get!(artifact_id) |> Repo.preload(review: :project)
        path = Path.join(artifact.review.project.path, artifact.file_path)
        File.mkdir_p!(Path.dirname(path))
        File.write!(path, content)
      end

      def pending_comment(round_id, params \\ %{}) do
        {:ok, comment} =
          :comment
          |> build(params)
          |> Map.put(:round_id, round_id)
          |> tag_line_range_anchor()
          |> Critique.add_comment()

        comment
      end

      # Test ergonomics: callers still pass `:start_line`/`:end_line` as flat
      # fields to set up a line-range located comment, and the factory folds
      # them into the tagged `:anchor` payload the authoring contract now
      # requires.
      defp tag_line_range_anchor(%{start_line: start_line, end_line: end_line} = params)
           when is_integer(start_line) and is_integer(end_line) do
        params
        |> Map.put(:anchor, %{type: "line_range", start_line: start_line, end_line: end_line})
        |> Map.drop([:start_line, :end_line])
      end

      defp tag_line_range_anchor(params), do: params

      def published_comment(round_id, params \\ %{}) do
        round_id
        |> pending_comment(params)
        |> Ecto.Changeset.change(status: :published)
        |> Repo.update!()
      end
    end
  end
end
