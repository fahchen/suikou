defmodule Suikou.Repo.Migrations.AddReviewInstructionsToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :review_instructions, :text
    end
  end
end
