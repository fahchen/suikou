# Additive seed: ingests the "Block & Width Test Doc" as a reviewable artifact
# WITHOUT touching any existing data. Run with:
#
#     mix run priv/repo/width_test_seed.exs
#
# Unlike priv/repo/seeds.exs this never calls delete_all, so it is safe to run
# against a database that already holds real reviews.

alias Suikou.Projects
alias Suikou.Repo
alias Suikou.Reviews
alias Suikou.Schemas.Project

project_dir = Path.expand("width_test_project", __DIR__)
file_path = "block-width-test.md"

# The markdown file lives alongside this script and is read live from disk by
# the running server; just make sure the directory exists.
File.mkdir_p!(project_dir)

project =
  case Repo.get_by(Project, path: project_dir) do
    %Project{} = existing ->
      existing

    nil ->
      {:ok, created} = Projects.register_project(%{name: "Width Test", path: project_dir})
      created
  end

{:ok, review} =
  Reviews.create_review(project, %{
    name: "Block & Width Test",
    selections: [file_path]
  })

{:ok, artifact} = Reviews.open_file(review, file_path)

IO.puts("""
Ingested artifact #{inspect(artifact.title)}
  artifact_id: #{artifact.id}
  review_id:   #{review.id}
  open at:     /review/#{artifact.id}
""")
