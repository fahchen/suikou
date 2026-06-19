defmodule Suikou.Repo.Migrations.ReplyStatusAndRound do
  use Ecto.Migration

  # Replies join the Draft/published lifecycle: a human reply is pending until the
  # round is submitted, an agent reply is published immediately. `round_id` records
  # the round a reply was written in. Existing replies predate the lifecycle, so
  # they backfill as published on their comment's creating round.
  def up do
    alter table(:replies) do
      add :status, :string, null: false, default: "pending"
      add :round_id, references(:rounds, on_delete: :delete_all)
    end

    execute("UPDATE replies SET status = 'published'")

    execute("""
    UPDATE replies
    SET round_id = (SELECT round_id FROM comments WHERE comments.id = replies.comment_id)
    WHERE round_id IS NULL
    """)

    create index(:replies, [:round_id])
  end

  def down do
    drop index(:replies, [:round_id])

    alter table(:replies) do
      remove :round_id
      remove :status
    end
  end
end
