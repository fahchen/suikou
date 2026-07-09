defmodule Suikou.Repo.Migrations.ReactionsOnePerActor do
  use Ecto.Migration

  def change do
    # The previous unique key was per-emoji ((target, emoji, actor)), which let a
    # single actor stack multiple emoji on one target. The rule is now one
    # reaction per actor per target, so the key drops `emoji`. Throwaway demo
    # data already violates this, so drop/recreate rather than migrate in place.
    drop table(:reactions)

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

    # One reaction per actor per target (not per emoji). NULLs are distinct in
    # SQLite, so a composite unique over nullable columns will NOT dedupe; use two
    # partial unique indexes instead, each scoped to its target kind.
    create unique_index(:reactions, [:comment_id, :actor],
             where: "reply_id IS NULL",
             name: :reactions_comment_actor
           )

    create unique_index(:reactions, [:reply_id, :actor],
             where: "comment_id IS NULL",
             name: :reactions_reply_actor
           )
  end
end
