defmodule Suikou.SettingsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Repo
  alias Suikou.Schemas.Settings, as: SettingsSchema
  alias Suikou.Settings

  describe "get_settings/0" do
    test "returns an empty struct before anything is written" do
      assert %SettingsSchema{review_instructions: nil} = Settings.get_settings()
    end
  end

  describe "update_settings/1" do
    test "writes the instructions and keeps a single row" do
      assert {:ok, %SettingsSchema{}} =
               Settings.update_settings(%{review_instructions: "Reply in English."})

      assert {:ok, %SettingsSchema{}} =
               Settings.update_settings(%{review_instructions: "Reply in Japanese."})

      assert %SettingsSchema{review_instructions: "Reply in Japanese."} = Settings.get_settings()
      assert Repo.aggregate(SettingsSchema, :count) == 1
    end

    test "stores blank instructions as nil" do
      assert {:ok, %SettingsSchema{review_instructions: nil}} =
               Settings.update_settings(%{review_instructions: "   "})
    end

    test "rejects instructions past the ceiling" do
      too_long = String.duplicate("x", SettingsSchema.max_instructions() + 1)

      assert {:error, %Ecto.Changeset{errors: [review_instructions: _error]}} =
               Settings.update_settings(%{review_instructions: too_long})
    end
  end

  describe "instructions_for/1" do
    test "returns the global text first and the project text second" do
      {:ok, _settings} = Settings.update_settings(%{review_instructions: "Reply in English."})
      project = insert(:project, review_instructions: "Report any Repo call inside queries/.")

      assert ["Reply in English.", "Report any Repo call inside queries/."] =
               Settings.instructions_for(project)
    end

    test "drops a level that carries no text" do
      project = insert(:project, review_instructions: "Project only.")

      assert ["Project only."] = Settings.instructions_for(project)
    end

    test "is empty when neither level carries text" do
      assert [] = Settings.instructions_for(insert(:project))
    end
  end
end
