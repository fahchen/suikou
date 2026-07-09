defmodule Suikou.Repo.Migrations.CreateReactions do
  use Ecto.Migration

  def change do
    create table(:reactions) do
      add :comment_id, references(:comments, on_delete: :delete_all), null: false
      add :emoji, :string, null: false
      add :actor, :string, null: false

      timestamps()
    end

    create unique_index(:reactions, [:comment_id, :emoji, :actor])
  end
end
