defmodule Suikou.Repo.Migrations.ReplyStatus do
  use Ecto.Migration

  # Replies join the Draft/published lifecycle: a human reply is pending until the
  # round is submitted, an agent reply is published immediately. Existing replies
  # predate the lifecycle, so they backfill as published.
  def up do
    alter table(:replies) do
      add :status, :string, null: false, default: "pending"
    end

    execute("UPDATE replies SET status = 'published'")
  end

  def down do
    alter table(:replies) do
      remove :status
    end
  end
end
