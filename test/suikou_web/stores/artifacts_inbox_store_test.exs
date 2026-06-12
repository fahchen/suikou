defmodule SuikouWeb.Stores.ArtifactsInboxStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Testing
  alias SuikouWeb.Stores.ArtifactsInboxStore

  describe "render/1" do
    test "renders an empty list when there are no artifacts" do
      page = Testing.mount(ArtifactsInboxStore)
      assert %{artifacts: []} = Testing.render(page)
    end

    test "lists every artifact newest first with title and latest round" do
      older = insert(:round).artifact
      newer = insert(:round).artifact

      page = Testing.mount(ArtifactsInboxStore)

      assert %{artifacts: [%{id: first}, %{id: second}]} = Testing.render(page)
      assert first == newer.id
      assert second == older.id
    end

    test "reflects the latest round number after the artifact advances" do
      artifact = insert(:round).artifact
      advance(artifact.id, "changed\n")

      page = Testing.mount(ArtifactsInboxStore)

      assert %{artifacts: [%{latest_round: 1}]} = Testing.render(page)
    end

    test "marks an artifact approved once a round is approved" do
      artifact = insert(:round).artifact
      Suikou.Submissions.submit(Suikou.Rounds.latest(artifact.id).id, :approve)

      page = Testing.mount(ArtifactsInboxStore)

      assert %{artifacts: [%{approved: true}]} = Testing.render(page)
    end

    test "an unapproved artifact reports approved false" do
      insert(:round)

      page = Testing.mount(ArtifactsInboxStore)

      assert %{artifacts: [%{approved: false}]} = Testing.render(page)
    end
  end
end
