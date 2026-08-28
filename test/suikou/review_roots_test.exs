defmodule Suikou.ReviewRootsTest do
  use ExUnit.Case, async: true

  alias Suikou.ReviewRoots
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review

  doctest Suikou.ReviewRoots

  @review %Review{
    id: "01a04600-0000-7000-8000-000000000000",
    project_path: "/proj",
    scratch_path: "/data/scratch/r1"
  }

  describe "locate/2" do
    test "resolves an unmarked path under the checkout" do
      assert {:ok, "/proj", "lib/app.ex"} = ReviewRoots.locate(@review, "lib/app.ex")
    end

    test "resolves the project marker under the checkout" do
      assert {:ok, "/proj", "lib/app.ex"} = ReviewRoots.locate(@review, "@project/lib/app.ex")
    end

    test "resolves the scratch marker under the scratch root" do
      assert {:ok, "/data/scratch/r1", "report.md"} =
               ReviewRoots.locate(@review, "@scratch/report.md")
    end

    test "resolves a bare marker to the root itself" do
      assert {:ok, "/data/scratch/r1", ""} = ReviewRoots.locate(@review, "@scratch")
    end

    test "rejects a traversal out of the checkout" do
      assert {:error, :unsafe_path} = ReviewRoots.locate(@review, "../etc/passwd")
    end

    test "rejects a traversal out of the scratch root, which cannot reach the checkout" do
      assert {:error, :unsafe_path} =
               ReviewRoots.locate(@review, "@scratch/../../proj/lib/app.ex")
    end
  end

  describe "relativize/2" do
    test "prefers the scratch root when one root nests inside the other" do
      review = %Review{@review | scratch_path: "/proj/.scratch"}

      assert ReviewRoots.relativize(review, "/proj/.scratch/report.md") == "@scratch/report.md"
    end

    test "answers nil for a path under neither root" do
      assert ReviewRoots.relativize(@review, "/elsewhere/x") == nil
    end
  end

  describe "scratch_dir/2" do
    test "collapses the identity into one readable directory" do
      project = %Project{name: "Example", identity: "github.com/fahchen/example"}

      assert ReviewRoots.scratch_dir(project, "review-a") =~
               ~r{/github\.com_fahchen_example/review-a$}
    end

    test "groups every review of one project under one heading" do
      project = %Project{name: "Example", identity: "github.com/fahchen/example"}

      first = ReviewRoots.scratch_dir(project, "review-a")
      second = ReviewRoots.scratch_dir(project, "review-b")

      assert Path.dirname(first) == Path.dirname(second)
      assert Path.basename(first) == "review-a"
    end

    test "keeps two forks of the same name apart" do
      mine = %Project{name: "Example", identity: "github.com/fahchen/example"}
      theirs = %Project{name: "Example", identity: "github.com/someone/example"}

      refute ReviewRoots.scratch_dir(mine, "r") == ReviewRoots.scratch_dir(theirs, "r")
    end

    test "drops a port and any middle groups, keeping host and owner/repository" do
      project = %Project{name: "Example", identity: "git.example.com:2222/group/sub/app"}

      assert ReviewRoots.scratch_dir(project, "r") =~ ~r{/git\.example\.com_sub_app/r$}
    end

    test "keeps only the checkout tail for a remote-less repository" do
      project = %Project{name: "Local", identity: "/Users/me/work/app/.git"}

      assert ReviewRoots.scratch_dir(project, "r") =~ ~r{/work_app/r$}
    end

    test "an underscore in a name never reads as a separator" do
      nested = %Project{name: "a", identity: "gitlab.com/group/sub/repo"}
      literal = %Project{name: "b", identity: "gitlab.com/group/sub_repo"}

      refute ReviewRoots.scratch_dir(nested, "r") == ReviewRoots.scratch_dir(literal, "r")
    end

    test "falls back to the project name when there is no identity" do
      project = %Project{name: "Loose Notes", identity: nil}

      assert ReviewRoots.scratch_dir(project, "r") =~ ~r{/loose-notes/r$}
    end

    test "cannot be walked out of the data directory" do
      project = %Project{name: "Nasty", identity: "../../../etc/passwd"}

      dir = ReviewRoots.scratch_dir(project, "r")

      assert dir =~ ~r{/etc_passwd/r$}
      refute String.contains?(dir, "..")
    end
  end
end
