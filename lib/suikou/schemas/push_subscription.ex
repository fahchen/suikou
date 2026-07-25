defmodule Suikou.Schemas.PushSubscription do
  @moduledoc """
  A single browser's Web Push subscription: the push service `endpoint` (its
  identity) plus the client's `p256dh`/`auth` keys used to encrypt each payload
  (RFC 8291). Rows are the registry `Suikou.Push` sends review notifications to;
  the notification content itself is never stored.
  """

  use Suikou.Schema

  typed_schema "push_subscriptions" do
    field :endpoint, :string, typed: [null: false]
    field :p256dh, :string, typed: [null: false]
    field :auth, :string, typed: [null: false]

    timestamps()
  end

  @doc """
  Builds a changeset for an incoming subscription, requiring all three fields and
  enforcing one row per `endpoint`.

  ## Examples

      iex> params = %{endpoint: "https://push/1", p256dh: "BPk", auth: "tBH"}
      iex> Suikou.Schemas.PushSubscription.changeset(params).valid?
      true

      iex> Suikou.Schemas.PushSubscription.changeset(%{endpoint: "https://push/1"}).valid?
      false

      iex> params = %{endpoint: "http://169.254.169.254/", p256dh: "BPk", auth: "tBH"}
      iex> Suikou.Schemas.PushSubscription.changeset(params).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(params) do
    %__MODULE__{}
    |> cast(params, [:endpoint, :p256dh, :auth])
    |> validate_required([:endpoint, :p256dh, :auth])
    # Real push-service endpoints are always https; requiring it keeps a caller
    # from registering a plaintext or internal URL the server would then POST to.
    |> validate_format(:endpoint, ~r{^https://}, message: "must be an https URL")
    |> unique_constraint(:endpoint)
  end
end
