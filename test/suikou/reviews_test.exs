defmodule Suikou.ReviewsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact

  describe "create_review/2" do
    @tag :tmp_dir
    test "mints one artifact at round 0 per selected file", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_review(project, %{
                 name: "Launch",
                 selections: ["plan.md", "spec.md"]
               })

      [a, b] = Reviews.get_review(review.id).artifacts
      assert Enum.sort([a.file_path, b.file_path]) == ["plan.md", "spec.md"]
      assert %{number: 0} = Rounds.latest(a.id)
    end

    @tag :tmp_dir
    test "expands a selected directory to its files and stores the selection", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join([dir, "docs", "spec.md"]), "# Spec\n")
      File.write!(Path.join(dir, "readme.md"), "# Readme\n")
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_review(project, %{name: "Launch", selections: ["docs", "readme.md"]})

      review = Reviews.get_review(review.id)

      assert Enum.map(review.artifacts, & &1.file_path) == [
               "docs/plan.md",
               "docs/spec.md",
               "readme.md"
             ]

      assert review.selection_paths == ["docs", "readme.md"]
    end

    @tag :tmp_dir
    test "rejects an empty selection", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :no_files} =
               Reviews.create_review(project, %{name: "Launch", selections: []})
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)

      assert {:error, %Ecto.Changeset{}} =
               Reviews.create_review(project, %{name: "  ", selections: ["plan.md"]})
    end

    @tag :tmp_dir
    test "rolls back the whole review when a file cannot be read", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "blank.md"), "   \n")
      project = insert(:project, path: dir)

      assert {:error, {:file, "blank.md", :empty_content}} =
               Reviews.create_review(project, %{
                 name: "Launch",
                 selections: ["plan.md", "blank.md"]
               })

      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "set_selection/2" do
    @tag :tmp_dir
    test "mints artifacts for newly added files", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md", "spec.md"])

      paths = Reviews.get_review(review.id).artifacts |> Enum.map(& &1.file_path) |> Enum.sort()
      assert paths == ["plan.md", "spec.md"]
    end

    @tag :tmp_dir
    test "soft-removes a deselected file but keeps its artifact history", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Reviews.create_review(project, %{name: "Launch", selections: ["plan.md", "spec.md"]})

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 2
    end

    @tag :tmp_dir
    test "restores a re-selected file instead of minting a duplicate", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      {:ok, _removed} = Reviews.set_selection(review, [])

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 1
    end

    @tag :tmp_dir
    test "restores a re-selected file when given a review preloaded active-only", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      {:ok, _removed} = Reviews.set_selection(Reviews.get_review(review.id), [])

      # The store hands set_selection a review preloaded with active artifacts only;
      # the soft-removed plan.md must still be restored, not duplicated.
      assert {:ok, _review} = Reviews.set_selection(Reviews.get_review(review.id), ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 1
    end
  end

  describe "delete_review/1" do
    @tag :tmp_dir
    test "deletes the review and cascades to its artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      assert {:ok, _review} = Reviews.delete_review(review)

      assert is_nil(Reviews.get_review(review.id))
      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "rename_review/2" do
    @tag :tmp_dir
    test "renames the review, leaving its artifacts untouched", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      assert {:ok, %{name: "Spec pass"}} = Reviews.rename_review(review, "Spec pass")
      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      assert {:error, %Ecto.Changeset{}} = Reviews.rename_review(review, "  ")
    end
  end

  describe "get_review/1 and list_for_project/1" do
    @tag :tmp_dir
    test "get_review preloads only active artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Reviews.create_review(project, %{name: "Launch", selections: ["plan.md", "spec.md"]})

      {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert %{artifacts: [%{file_path: "plan.md"}]} = Reviews.get_review(review.id)
    end

    test "get_review returns nil for an unknown id" do
      assert is_nil(Reviews.get_review("00000000-0000-7000-8000-000000000000"))
    end

    @tag :tmp_dir
    test "list_for_project returns a project's reviews newest first", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      {:ok, _first} = Reviews.create_review(project, %{name: "First", selections: ["plan.md"]})
      {:ok, _second} = Reviews.create_review(project, %{name: "Second", selections: ["plan.md"]})

      assert ["Second", "First"] = project |> Reviews.list_for_project() |> Enum.map(& &1.name)
    end
  end
end
