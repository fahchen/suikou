defmodule Suikou.Repo.Migrations.DecoupleStoredContent do
  use Ecto.Migration

  def change do
    alter table(:rounds) do
      remove :content, :text, null: false
    end

    alter table(:comments) do
      remove :outdated, :boolean, null: false, default: false
    end
  end
end
