defmodule Suikou.Repo.Migrations.AddRespectGitignoreToReviews do
  use Ecto.Migration

  # Nullable on purpose: `NULL` means "whatever the project says", so an existing
  # review keeps following its project and only a review that was deliberately
  # set carries a value of its own.
  def change do
    alter table(:reviews) do
      add :respect_gitignore, :boolean
    end
  end
end
