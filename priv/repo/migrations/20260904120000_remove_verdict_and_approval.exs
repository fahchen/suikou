defmodule Suikou.Repo.Migrations.RemoveVerdictAndApproval do
  use Ecto.Migration

  def change do
    alter table(:submissions) do
      remove :verdict, :string, null: false
    end

    alter table(:rounds) do
      remove :draft_verdict, :string
    end

    alter table(:artifacts) do
      remove :approved_round, :integer
    end
  end
end
