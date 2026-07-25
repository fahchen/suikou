defmodule Suikou.Repo.Migrations.CreatePushSubscriptions do
  use Ecto.Migration

  def change do
    create table(:push_subscriptions) do
      # The push service URL is the subscription's identity — one row per browser
      # subscription; re-subscribing the same endpoint updates its keys in place.
      add :endpoint, :string, null: false
      # The client's ECDH public key and auth secret (base64url), used to encrypt
      # each payload for this subscriber (RFC 8291).
      add :p256dh, :string, null: false
      add :auth, :string, null: false

      timestamps()
    end

    create unique_index(:push_subscriptions, [:endpoint])
  end
end
