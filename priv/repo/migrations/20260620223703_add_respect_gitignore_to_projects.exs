defmodule Suikou.Repo.Migrations.AddRespectGitignoreToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :respect_gitignore, :boolean, null: false, default: true
    end
  end
end
