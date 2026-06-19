defmodule Suikou.Repo.Migrations.SingleRowCommentModel do
  use Ecto.Migration

  # A comment is now a single row across all rounds (see the comment-lifecycle
  # BDR): its per-round visibility is derived from `authored_round` (the round it
  # was created in, denormalized for every scope) and `resolved_round`. Carry-
  # forward, which copied each unresolved comment into the next round as a new
  # `origin_id`-linked row, is gone — so the self-reference drops.
  def up do
    drop index(:comments, [:origin_id])

    rename table(:comments), :original_round, to: :authored_round

    # Generalize the once located-only authored round to every scope: backfill
    # from the comment's creating round so existing rows carry their round number.
    execute("""
    UPDATE comments
    SET authored_round = (SELECT number FROM rounds WHERE rounds.id = comments.round_id)
    WHERE authored_round IS NULL
    """)

    alter table(:comments) do
      remove :origin_id
    end
  end

  def down do
    alter table(:comments) do
      add :origin_id, references(:comments, on_delete: :nilify_all)
    end

    execute("UPDATE comments SET authored_round = NULL WHERE scope != 'located'")

    rename table(:comments), :authored_round, to: :original_round

    create index(:comments, [:origin_id])
  end
end
