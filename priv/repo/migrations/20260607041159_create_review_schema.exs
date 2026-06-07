defmodule Suikou.Repo.Migrations.CreateReviewSchema do
  use Ecto.Migration

  def change do
    create table(:artifacts) do
      add :title, :string, null: false
      add :approved_round, :integer

      timestamps()
    end

    create table(:rounds) do
      add :artifact_id, references(:artifacts, on_delete: :delete_all), null: false
      add :number, :integer, null: false
      add :content, :text, null: false
      add :content_hash, :string, null: false

      timestamps()
    end

    create unique_index(:rounds, [:artifact_id, :number])

    create table(:comments) do
      add :round_id, references(:rounds, on_delete: :delete_all), null: false
      add :origin_id, references(:comments, on_delete: :nilify_all)
      add :scope, :string, null: false
      add :anchor, :map
      add :original_anchor, :map
      add :original_round, :integer
      add :critique_type, :string, null: false
      add :body, :text, null: false
      add :status, :string, null: false, default: "pending"
      add :resolved_round, :integer
      add :outdated, :boolean, null: false, default: false

      timestamps()
    end

    create index(:comments, [:round_id])
    create index(:comments, [:origin_id])

    create table(:reviews) do
      add :round_id, references(:rounds, on_delete: :delete_all), null: false
      add :verdict, :string, null: false

      timestamps()
    end

    create index(:reviews, [:round_id])

    create table(:replies) do
      add :comment_id, references(:comments, on_delete: :delete_all), null: false
      add :author, :string, null: false
      add :body, :text, null: false

      timestamps()
    end

    create index(:replies, [:comment_id])
  end
end
