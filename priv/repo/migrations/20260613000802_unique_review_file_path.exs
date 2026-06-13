defmodule Suikou.Repo.Migrations.UniqueReviewFilePath do
  use Ecto.Migration

  # One artifact per (review, file). The composite uniqueness makes lazy
  # find-or-create-on-open race-safe and subsumes the old review_id-only index.
  def change do
    create unique_index(:artifacts, [:review_id, :file_path])
    drop index(:artifacts, [:review_id])
  end
end
