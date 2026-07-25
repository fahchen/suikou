defmodule Suikou.PushTest do
  use Suikou.DataCase

  alias Suikou.Push
  alias Suikou.Repo
  alias Suikou.Schemas.PushSubscription

  describe "subscribe/1" do
    test "stores a valid subscription" do
      assert {:ok, %PushSubscription{endpoint: "https://push/1"}} =
               Push.subscribe(%{endpoint: "https://push/1", p256dh: "BPk", auth: "tBH"})
    end

    test "re-subscribing the same endpoint replaces its keys in place" do
      params = %{endpoint: "https://push/1", p256dh: "old", auth: "oldauth"}
      assert {:ok, %PushSubscription{}} = Push.subscribe(params)

      assert {:ok, %PushSubscription{p256dh: "new", auth: "newauth"}} =
               Push.subscribe(%{params | p256dh: "new", auth: "newauth"})

      assert [%PushSubscription{p256dh: "new"}] = Repo.all(PushSubscription)
    end

    test "rejects a subscription missing its keys" do
      assert {:error, %Ecto.Changeset{}} = Push.subscribe(%{endpoint: "https://push/1"})
    end
  end

  describe "unsubscribe/1" do
    test "drops the subscription for an endpoint" do
      {:ok, _subscription} =
        Push.subscribe(%{endpoint: "https://push/1", p256dh: "BPk", auth: "tBH"})

      assert :ok = Push.unsubscribe("https://push/1")
      assert [] = Repo.all(PushSubscription)
    end

    test "is idempotent for an unknown endpoint" do
      assert :ok = Push.unsubscribe("https://push/none")
    end
  end

  describe "notify/1" do
    test "delivers to every subscription and prunes the ones reported expired" do
      {:ok, _live} = Push.subscribe(%{endpoint: "https://push/live", p256dh: "BPk", auth: "tBH"})

      {:ok, _gone} =
        Push.subscribe(%{endpoint: "https://push/expired", p256dh: "BPk", auth: "tBH"})

      assert {:ok, 1} = Push.notify(%{title: "Spec", body: "Ready", url: "https://s/reviews/1"})
      assert [%PushSubscription{endpoint: "https://push/live"}] = Repo.all(PushSubscription)
    end

    test "returns zero when there are no subscriptions" do
      assert {:ok, 0} = Push.notify(%{title: "Spec", body: "Ready", url: "https://s/reviews/1"})
    end

    test "keeps delivering when a subscriber's send raises, and keeps that row" do
      {:ok, _boom} = Push.subscribe(%{endpoint: "https://push/boom", p256dh: "BPk", auth: "tBH"})
      {:ok, _live} = Push.subscribe(%{endpoint: "https://push/live", p256dh: "BPk", auth: "tBH"})

      assert {:ok, 1} = Push.notify(%{title: "Spec", body: "Ready", url: "https://s/reviews/1"})
      # A transport failure says nothing about the subscription's validity, so the
      # row survives for the next attempt — unlike an expired one.
      assert [_boom, _live] = Repo.all(PushSubscription)
    end
  end
end
