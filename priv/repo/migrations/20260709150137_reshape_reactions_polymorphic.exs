defmodule Suikou.Repo.Migrations.ReshapeReactionsPolymorphic do
  use Ecto.Migration

  def change do
    drop table(:reactions)

    # Exactly one target. SQLite booleans are 0/1, so summing the two IS NOT NULL
    # tests must equal 1. SQLite does not support `ALTER TABLE ADD CONSTRAINT`, so
    # ecto_sqlite3 cannot emit a standalone `create constraint(...)`. A column-level
    # CHECK inlined into the table create is accepted and (in SQLite) may reference
    # sibling columns, giving the same table-wide guard.
    create table(:reactions) do
      add :comment_id, references(:comments, on_delete: :delete_all)
      add :reply_id, references(:replies, on_delete: :delete_all)
      add :emoji, :string,
        null: false,
        check: %{
          name: "reaction_exactly_one_target",
          expr: "((comment_id IS NOT NULL) + (reply_id IS NOT NULL)) = 1"
        }

      add :actor, :string, null: false

      timestamps()
    end

    # NULLs are distinct in SQLite, so a single composite unique over nullable
    # columns will NOT dedupe; use two partial unique indexes instead.
    create unique_index(:reactions, [:comment_id, :emoji, :actor],
             where: "reply_id IS NULL",
             name: :reactions_comment_emoji_actor
           )

    create unique_index(:reactions, [:reply_id, :emoji, :actor],
             where: "comment_id IS NULL",
             name: :reactions_reply_emoji_actor
           )
  end
end
