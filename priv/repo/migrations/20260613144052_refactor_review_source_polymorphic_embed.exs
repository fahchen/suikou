defmodule Suikou.Repo.Migrations.RefactorReviewSourcePolymorphicEmbed do
  use Ecto.Migration

  # Review storage is becoming polymorphic so a git-diff review can ride the
  # same row alongside a file-selection review (see BDR-0020). Fold each
  # existing review's `selection_paths` into a tagged `source` map, then drop
  # the flat column. `json(selection_paths)` reparses the stored JSON-text
  # array so the resulting object contains the array verbatim rather than a
  # double-encoded string.
  def up do
    alter table(:reviews) do
      add :source, :map
    end

    flush()

    execute("""
    UPDATE reviews
    SET source = json_object(
      '__type__', 'file_selection',
      'selection_paths', json(selection_paths)
    )
    """)

    alter table(:reviews) do
      remove :selection_paths
    end
  end

  def down, do: raise("irreversible: Review.selection_paths has been folded into source")
end
