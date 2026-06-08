defmodule Suikou.Repo.Migrations.AddProjects do
  use Ecto.Migration

  def change do
    create table(:projects) do
      add :name, :string, null: false
      add :path, :string, null: false

      timestamps()
    end

    create unique_index(:projects, [:path])

    # Every artifact is born from a file selected under a project (BDR-0018), so
    # both columns are mandatory.
    alter table(:artifacts) do
      add :project_id, references(:projects, on_delete: :delete_all), null: false
      add :file_path, :string, null: false
    end

    create index(:artifacts, [:project_id])
  end
end
