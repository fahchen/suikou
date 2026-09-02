defmodule Suikou.Repo.Migrations.MoveRootsToReviews do
  use Ecto.Migration

  # A project stops being a directory and becomes a label plus a repository
  # identity; the two roots a review reads from move onto the review itself.
  # `identity` is left NULL — a migration has no business shelling out to git —
  # and `Suikou.Projects` resolves it on first use.
  def up do
    alter table(:reviews) do
      add :project_path, :string, null: false, default: ""
      add :scratch_path, :string, null: false, default: ""
    end

    # The raw backfill reads the columns just added, so the DDL must land first.
    flush()

    execute("""
    UPDATE reviews
    SET project_path = (SELECT p.path FROM projects p WHERE p.id = reviews.project_id)
    """)

    flush()
    backfill_scratch_paths()

    drop unique_index(:projects, [:path])

    alter table(:projects) do
      add :identity, :string
      remove :path
    end

    create unique_index(:projects, [:identity], where: "identity IS NOT NULL")
  end

  def down do
    drop unique_index(:projects, [:identity])

    alter table(:projects) do
      add :path, :string, null: false, default: ""
      remove :identity
    end

    # A project with no reviews has no path to restore, and `path` is about to
    # carry a unique index again — so give each one its own placeholder rather
    # than a shared empty string that the index would reject.
    execute("""
    UPDATE projects
    SET path = COALESCE(
      (SELECT r.project_path FROM reviews r WHERE r.project_id = projects.id ORDER BY r.id LIMIT 1),
      'unknown-' || projects.id
    )
    """)

    create unique_index(:projects, [:path])

    alter table(:reviews) do
      remove :project_path
      remove :scratch_path
    end
  end

  # A migration has no business shelling out to git, so a backfilled review is
  # grouped by its checkout path rather than by the repository identity a new
  # review would resolve. Same layout, different heading.
  defp backfill_scratch_paths do
    %{rows: rows} = repo().query!("SELECT id, project_path FROM reviews", [], log: false)

    Enum.each(rows, fn [id, project_path] ->
      repo().query!(
        "UPDATE reviews SET scratch_path = ?1 WHERE id = ?2",
        [scratch_path(id, project_path), id],
        log: false
      )
    end)
  end

  defp scratch_path(review_id, project_path) do
    slug =
      project_path
      |> Kernel.||("")
      |> Path.expand()
      |> String.split("/", trim: true)
      |> Enum.take(-2)
      |> Enum.map(&(&1 |> String.downcase() |> String.replace(~r/[^a-z0-9._-]+/, "-")))
      |> Enum.reject(&(&1 in ["", ".", ".."]))
      |> Enum.join("_")

    Path.join([data_dir(), slug, review_id])
  end

  defp data_dir do
    data_home = System.get_env("XDG_DATA_HOME") || Path.join(System.user_home!(), ".local/share")
    Path.join(data_home, "suikou")
  end
end
