defmodule Suikou.Repo.Migrations.AddDraftVerdictToRounds do
  use Ecto.Migration

  def change do
    alter table(:rounds) do
      add :draft_verdict, :string
    end
  end
end
