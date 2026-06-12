defmodule Suikou.Repo.Migrations.AddSelectionPathsToReviews do
  use Ecto.Migration

  def change do
    alter table(:reviews) do
      add :selection_paths, {:array, :string}, null: false, default: "[]"
    end
  end
end
