defmodule SuikouWeb.UserSocket do
  @moduledoc """
  Musubi socket transport. Lists the root stores a client may mount; the
  `:musubi_ts` compiler derives the `Musubi.Stores` TypeScript registry from
  this list.
  """

  use Musubi.Socket,
    roots: [
      SuikouWeb.Stores.CounterStore,
      SuikouWeb.Stores.ArtifactsInboxStore,
      SuikouWeb.Stores.ReviewStore
    ]

  alias Musubi.Socket

  @impl Musubi.Socket
  @spec handle_connect(Socket.connect_params(), Socket.t()) :: {:ok, Socket.t()}
  def handle_connect(_params, socket) do
    {:ok, socket}
  end

  @impl Musubi.Socket
  @spec handle_join(Socket.join_params(), Socket.t()) :: {:ok, Socket.t()}
  def handle_join(_params, socket) do
    {:ok, socket}
  end
end
