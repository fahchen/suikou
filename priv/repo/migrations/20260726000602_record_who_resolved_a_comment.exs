defmodule Suikou.Repo.Migrations.RecordWhoResolvedAComment do
  use Ecto.Migration

  # Resolving used to be the reviewer's alone, so the round number was the whole
  # story. Now any agent may resolve, and "addressed" without "by whom" is not
  # something the human can act on — reopening a peer's premature resolve means
  # knowing it was a peer's.
  #
  # Mirrors the author columns: a kind plus the resolver's name, `""` for the
  # human. Nullable rather than defaulted, because a row resolved before this
  # migration genuinely has no answer — `NULL` says "unknown", where `"human"`
  # would assert something the data does not support.
  def change do
    alter table(:comments) do
      add :resolved_by, :string
      add :resolved_by_name, :string
    end
  end
end
