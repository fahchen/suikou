defmodule Suikou.Repo.Migrations.BackfillReviewSelectionPaths do
  use Ecto.Migration

  # Reviews created before selections were stored default to an empty selection,
  # which would render the editor with nothing checked. Seed each such review's
  # selection from its active artifact files so editing preserves the existing
  # picks. Arrays are stored as JSON, matching `json_group_array`'s output.
  def up do
    execute("""
    UPDATE reviews
    SET selection_paths = COALESCE(
      (SELECT json_group_array(file_path)
       FROM (SELECT file_path FROM artifacts
             WHERE artifacts.review_id = reviews.id AND artifacts.removed_at IS NULL
             ORDER BY file_path)),
      '[]')
    WHERE selection_paths = '[]'
    """)
  end

  def down, do: :ok
end
