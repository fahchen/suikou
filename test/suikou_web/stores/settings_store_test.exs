defmodule SuikouWeb.Stores.SettingsStoreTest do
  use Suikou.DataCase

  alias Musubi.Testing
  alias Suikou.Schemas.Settings
  alias SuikouWeb.Stores.SettingsStore

  describe "render/1" do
    test "renders no instructions before anything is written" do
      page = Testing.mount(SettingsStore)

      assert %{review_instructions: nil, saved_at: nil} = Testing.render(page)
    end
  end

  describe "update_settings" do
    test "stores the instructions and renders them back" do
      page = Testing.mount(SettingsStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :update_settings, %{
                 review_instructions: "Reply in English."
               })

      assert %{review_instructions: "Reply in English.", saved_at: saved_at} =
               Testing.render(page)

      assert {:ok, %DateTime{}, 0} = DateTime.from_iso8601(saved_at)
    end

    test "clears the instructions when the text area is emptied" do
      page = Testing.mount(SettingsStore)

      {:ok, _reply} =
        Testing.dispatch_command(page, :update_settings, %{
          review_instructions: "Reply in English."
        })

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :update_settings, %{review_instructions: nil})

      assert %{review_instructions: nil} = Testing.render(page)
    end

    test "reports an error for instructions past the ceiling" do
      page = Testing.mount(SettingsStore)
      too_long = String.duplicate("x", Settings.max_instructions() + 1)

      assert {:ok, %{error: "invalid_instructions"}} =
               Testing.dispatch_command(page, :update_settings, %{review_instructions: too_long})
    end
  end
end
