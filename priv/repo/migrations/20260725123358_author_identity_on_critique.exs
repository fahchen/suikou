defmodule Suikou.Repo.Migrations.AuthorIdentityOnCritique do
  use Ecto.Migration

  # Several agents now review alongside the human, so every authored row has to
  # say *which* one wrote it. `author`/`actor` already answers human-or-agent;
  # `_name` and `_icon` carry the individual identity the agent supplies on the
  # command, denormalized onto the row rather than joined from a roster — an
  # agent names itself per call and there is nothing to register.
  #
  # `""` means "no individual identity": every pre-existing row, and the human,
  # who stays anonymous. Empty string rather than NULL so the widened reaction
  # unique keys below actually dedupe (SQLite treats NULLs as distinct).
  def change do
    alter table(:comments) do
      add :author, :string, null: false, default: "human"
      add :author_name, :string, null: false, default: ""
      add :author_icon, :string, null: false, default: ""
    end

    alter table(:replies) do
      add :author_name, :string, null: false, default: ""
      add :author_icon, :string, null: false, default: ""
    end

    alter table(:reactions) do
      add :actor_name, :string, null: false, default: ""
      add :actor_icon, :string, null: false, default: ""
    end

    # One reaction per *identity* per target, not per actor kind: two agents
    # reacting on the same comment are two rows, while one agent switching emoji
    # still replaces its own. The human keeps a single slot via its empty name.
    drop unique_index(:reactions, [:comment_id, :actor], name: :reactions_comment_actor)
    drop unique_index(:reactions, [:reply_id, :actor], name: :reactions_reply_actor)

    create unique_index(:reactions, [:comment_id, :actor, :actor_name],
             where: "reply_id IS NULL",
             name: :reactions_comment_actor_name
           )

    create unique_index(:reactions, [:reply_id, :actor, :actor_name],
             where: "comment_id IS NULL",
             name: :reactions_reply_actor_name
           )
  end
end
