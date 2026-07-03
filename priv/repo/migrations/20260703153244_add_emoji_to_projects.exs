defmodule Suikou.Repo.Migrations.AddEmojiToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :emoji, :string
    end
  end
end
