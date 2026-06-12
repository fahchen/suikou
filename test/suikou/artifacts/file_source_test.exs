defmodule Suikou.Artifacts.FileSourceTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Artifacts
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round

  describe "create_from_file/2" do
    @tag :tmp_dir
    test "creates an artifact at round 0 from the file on disk", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      review = insert(:review, project: build(:project, path: dir))

      assert {:ok, %{artifact: %Artifact{} = artifact, round: %Round{} = round}} =
               Artifacts.create_from_file(review, "plan.md")

      assert %Artifact{title: "plan.md", file_path: "plan.md", review_id: review_id} = artifact
      assert review_id == review.id
      assert %Round{number: 0, content: "# Plan\nbody\n"} = round
    end

    @tag :tmp_dir
    test "rejects an empty file", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      review = insert(:review, project: build(:project, path: dir))

      assert {:error, :empty_content} = Artifacts.create_from_file(review, "blank.md")
    end

    @tag :tmp_dir
    test "rejects a missing file", %{tmp_dir: dir} do
      review = insert(:review, project: build(:project, path: dir))

      assert {:error, :not_a_file} = Artifacts.create_from_file(review, "nope.md")
    end

    @tag :tmp_dir
    test "rejects a path escaping the project", %{tmp_dir: dir} do
      review = insert(:review, project: build(:project, path: dir))

      assert {:error, :unsafe_path} = Artifacts.create_from_file(review, "../escape.md")
    end
  end
end
