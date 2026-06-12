defmodule Suikou.Repo.Migrations.AddProjects do
  use Ecto.Migration

  def change do
    create table(:projects) do
      add :name, :string, null: false
      add :path, :string, null: false

      timestamps()
    end

    create unique_index(:projects, [:path])

    # A review groups the files a reviewer selected under a project; each selected
    # file becomes one artifact under the review (see BDR-0018).
    create table(:reviews) do
      add :project_id, references(:projects, on_delete: :delete_all), null: false
      add :name, :string, null: false

      timestamps()
    end

    create index(:reviews, [:project_id])

    # Every artifact is born from a file selected into a review. `removed_at`
    # soft-removes a file from its review while keeping its critique history.
    alter table(:artifacts) do
      add :review_id, references(:reviews, on_delete: :delete_all), null: false
      add :file_path, :string, null: false
      add :removed_at, :utc_datetime
    end

    create index(:artifacts, [:review_id])
  end
end
