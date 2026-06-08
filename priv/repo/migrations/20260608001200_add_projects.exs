defmodule Suikou.Repo.Migrations.AddProjects do
  use Ecto.Migration

  def change do
    create table(:projects) do
      add :name, :string, null: false
      add :path, :string, null: false

      timestamps()
    end

    create unique_index(:projects, [:path])

    # project_id/file_path are nullable during the H→I transition: the legacy
    # agent-submission path still mints project-less artifacts. Phase I removes
    # that path and tightens project_id to NOT NULL (see BDR-0018, task_plan.md).
    alter table(:artifacts) do
      add :project_id, references(:projects, on_delete: :delete_all)
      add :file_path, :string
    end

    create index(:artifacts, [:project_id])
  end
end
