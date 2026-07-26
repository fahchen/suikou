defmodule Suikou.Repo.Migrations.RecordWhoResolvedAComment do
  use Ecto.Migration

  # Resolving used to be the reviewer's alone, so the round number was the whole
  # story. Now any agent may resolve, and "addressed" without "by whom" is not
  # something the human can act on — reopening a peer's premature resolve means
  # knowing it was a peer's.
  #
  # Mirrors the author columns: a kind plus the resolver's name, `""` for the
  # human. Nullable because an *unresolved* comment has no resolver — that is the
  # only reason they stay null.
  #
  # Explicit `up`/`down` rather than `change/0`: the backfill needs `flush/0` to
  # see the new columns, and `change/0` rejects it.
  def up do
    alter table(:comments) do
      add :resolved_by, :string
      add :resolved_by_name, :string
    end

    flush()

    # Every existing resolution is the reviewer's: resolving was theirs alone
    # until now, so the backfill asserts nothing the data does not already say.
    # Leaving them null would invent an "unknown resolver" state that never
    # existed and that every reader would have to special-case forever.
    execute("""
    UPDATE comments
       SET resolved_by = 'human', resolved_by_name = ''
     WHERE resolved_round IS NOT NULL
    """)
  end

  def down do
    alter table(:comments) do
      remove :resolved_by
      remove :resolved_by_name
    end
  end
end
