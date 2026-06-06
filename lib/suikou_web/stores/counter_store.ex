defmodule SuikouWeb.Stores.CounterStore do
  @moduledoc """
  Placeholder root store wiring Musubi end-to-end.

  Replace with real review stores (artifacts, rounds, discussion) as the domain
  lands. Renders a single server-owned counter and accepts an `increment`
  command so the React client can exercise snapshot + command round-trips.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket

  state do
    field(:count, integer())
  end

  command :increment do
    payload do
      field(:amount, integer())
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(params, socket) do
    {:ok, Socket.assign(socket, :count, Map.get(params, "count", 0))}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: %{count: integer()}
  def render(socket) do
    %{count: socket.assigns.count}
  end

  @impl Musubi.Store
  @spec handle_command(:increment, map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:increment, %{"amount" => amount}, socket) do
    {:noreply, Socket.assign(socket, :count, socket.assigns.count + amount)}
  end
end
