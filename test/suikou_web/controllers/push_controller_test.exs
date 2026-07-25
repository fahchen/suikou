defmodule SuikouWeb.PushControllerTest do
  use SuikouWeb.ConnCase

  alias Suikou.Repo
  alias Suikou.Schemas.PushSubscription

  describe "GET /api/push/config" do
    test "returns the configured VAPID public key", %{conn: conn} do
      conn = get(conn, ~p"/api/push/config")
      key = Application.get_env(:web_push_elixir, :vapid_public_key)

      assert %{"public_key" => ^key} = json_response(conn, 200)
    end
  end

  describe "POST /api/push/subscribe" do
    test "stores a valid subscription", %{conn: conn} do
      conn =
        post(conn, ~p"/api/push/subscribe", %{
          endpoint: "https://push/1",
          p256dh: "BPk",
          auth: "tBH"
        })

      assert %{"ok" => true} = json_response(conn, 200)
      assert [%PushSubscription{endpoint: "https://push/1"}] = Repo.all(PushSubscription)
    end

    test "rejects an incomplete subscription with 422", %{conn: conn} do
      conn = post(conn, ~p"/api/push/subscribe", %{endpoint: "https://push/1"})

      assert %{"errors" => %{"p256dh" => [_p256dh | _rest], "auth" => [_auth | _more]}} =
               json_response(conn, 422)
    end
  end

  describe "DELETE /api/push/subscribe" do
    test "drops the subscription and answers 204", %{conn: conn} do
      {:ok, _subscription} =
        Suikou.Push.subscribe(%{endpoint: "https://push/1", p256dh: "BPk", auth: "tBH"})

      conn = delete(conn, ~p"/api/push/subscribe", %{endpoint: "https://push/1"})

      assert response(conn, 204)
      assert [] = Repo.all(PushSubscription)
    end
  end
end
