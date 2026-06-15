defmodule Suikou.Repo.Migrations.RefactorCommentScopeAndDropOriginalAnchor do
  use Ecto.Migration

  # Comment.scope is collapsing to attachment-level only (`:review | :artifact |
  # :located`); the old `:line`/`:file` names baked anchor-kind into the enum.
  # Rewrite stored values before dropping the now-unread `original_anchor`
  # column (see BDR-0022).
  def up do
    execute("UPDATE comments SET scope = 'located' WHERE scope = 'line'")
    execute("UPDATE comments SET scope = 'artifact' WHERE scope = 'file'")

    alter table(:comments) do
      remove :original_anchor
    end
  end

  def down do
    alter table(:comments) do
      add :original_anchor, :map
    end

    execute("UPDATE comments SET scope = 'line' WHERE scope = 'located'")
    execute("UPDATE comments SET scope = 'file' WHERE scope = 'artifact'")
  end
end
