defmodule Suikou.ReviewsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact

  describe "create_review/2" do
    @tag :tmp_dir
    test "stores the selection without minting any artifacts", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join(dir, "readme.md"), "# Readme\n")
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_review(project, %{name: "Launch", selections: ["docs", "readme.md"]})

      assert review.selection_paths == ["docs", "readme.md"]
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "succeeds even when a selected file is unreadable (validated on open)", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:ok, _review} =
               Reviews.create_review(project, %{name: "Launch", selections: ["missing.md"]})
    end

    @tag :tmp_dir
    test "rejects an empty selection", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :no_files} =
               Reviews.create_review(project, %{name: "Launch", selections: []})
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, %Ecto.Changeset{}} =
               Reviews.create_review(project, %{name: "  ", selections: ["plan.md"]})
    end
  end

  describe "open_file/2" do
    @tag :tmp_dir
    test "mints a round-0 artifact on first open and returns the same one after", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:ok, artifact} = Reviews.open_file(review, "plan.md")
      assert %{number: 0} = Rounds.latest(artifact.id)

      assert {:ok, ^artifact} = Reviews.open_file(review, "plan.md")
      assert Repo.aggregate(Artifact, :count) == 1
    end

    @tag :tmp_dir
    test "opens a file covered by a selected directory", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      review = review_with(dir, ["docs"])

      assert {:ok, %Artifact{file_path: "docs/plan.md"}} =
               Reviews.open_file(review, "docs/plan.md")
    end

    @tag :tmp_dir
    test "restores a soft-removed artifact rather than minting a duplicate", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _artifact} = Reviews.open_file(review, "plan.md")
      {:ok, _review} = Reviews.set_selection(review, [])

      assert {:ok, restored} = Reviews.open_file(review, "plan.md")
      assert is_nil(restored.removed_at)
      assert Repo.aggregate(Artifact, :count) == 1
    end

    @tag :tmp_dir
    test "rejects a path not covered by the selection", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:error, :not_covered} = Reviews.open_file(review, "other.md")
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "surfaces a per-file error when the covered file is unreadable", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      review = review_with(dir, ["blank.md"])

      assert {:error, :empty_content} = Reviews.open_file(review, "blank.md")
      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "set_selection/2" do
    @tag :tmp_dir
    test "stores the new selection and mints nothing", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md"])

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md", "spec.md"])
      assert Reviews.get_review(review.id).selection_paths == ["plan.md", "spec.md"]
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "soft-removes a deselected opened file but keeps its history", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md", "spec.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _b} = Reviews.open_file(review, "spec.md")

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 2
    end

    @tag :tmp_dir
    test "restores a re-selected opened file given a review preloaded active-only", %{
      tmp_dir: dir
    } do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _removed} = Reviews.set_selection(Reviews.get_review(review.id), [])

      assert {:ok, _review} = Reviews.set_selection(Reviews.get_review(review.id), ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 1
    end
  end

  describe "list_files/1" do
    @tag :tmp_dir
    test "expands the selection, reporting opened vs unopened files", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join([dir, "docs", "spec.md"]), "# Spec\n")
      review = review_with(dir, ["docs"])
      {:ok, opened} = Reviews.open_file(review, "docs/plan.md")

      files = Reviews.list_files(Reviews.get_review(review.id))

      assert [
               %{path: "docs/plan.md", artifact_id: id, approved: false},
               %{path: "docs/spec.md", artifact_id: nil, approved: false}
             ] = files

      assert id == opened.id
    end

    @tag :tmp_dir
    test "includes a file added under a selected directory after creation", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      review = review_with(dir, ["docs"])

      File.write!(Path.join([dir, "docs", "later.md"]), "# Later\n")

      paths = review.id |> Reviews.get_review() |> Reviews.list_files() |> Enum.map(& &1.path)
      assert paths == ["docs/later.md", "docs/plan.md"]
    end
  end

  describe "delete_review/1" do
    @tag :tmp_dir
    test "deletes the review and cascades to its opened artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")

      assert {:ok, _review} = Reviews.delete_review(review)
      assert is_nil(Reviews.get_review(review.id))
      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "rename_review/2" do
    @tag :tmp_dir
    test "renames the review, leaving its selection untouched", %{tmp_dir: dir} do
      review = review_with(dir, ["plan.md"])

      assert {:ok, %{name: "Spec pass"}} = Reviews.rename_review(review, "Spec pass")
      assert Reviews.get_review(review.id).selection_paths == ["plan.md"]
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      review = review_with(dir, ["plan.md"])

      assert {:error, %Ecto.Changeset{}} = Reviews.rename_review(review, "  ")
    end
  end

  describe "get_review/1 and list_for_project/1" do
    @tag :tmp_dir
    test "get_review preloads only active artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md", "spec.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _b} = Reviews.open_file(review, "spec.md")
      {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert %{artifacts: [%{file_path: "plan.md"}]} = Reviews.get_review(review.id)
    end

    test "get_review returns nil for an unknown id" do
      assert is_nil(Reviews.get_review("00000000-0000-7000-8000-000000000000"))
    end

    @tag :tmp_dir
    test "list_for_project returns a project's reviews newest first", %{tmp_dir: dir} do
      project = insert(:project, path: dir)
      {:ok, _first} = Reviews.create_review(project, %{name: "First", selections: ["plan.md"]})
      {:ok, _second} = Reviews.create_review(project, %{name: "Second", selections: ["plan.md"]})

      assert [%{name: "Second"}, %{name: "First"}] = Reviews.list_for_project(project)
    end
  end

  defp review_with(dir, selections) do
    project = insert(:project, path: dir)
    {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: selections})
    %{review | project: project}
  end
end
