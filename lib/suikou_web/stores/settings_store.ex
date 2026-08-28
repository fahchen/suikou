defmodule SuikouWeb.Stores.SettingsStore do
  @moduledoc """
  Root store backing the settings modal's global preferences.

  Takes no mount params. It carries the review instructions every agent must
  follow, and the `update_settings` command writes them. The modal opens over
  the board and over a review, so it mounts this store itself rather than
  reading the field off either page's store.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket
  alias Suikou.Schemas.Settings
  alias Suikou.Settings, as: SettingsContext

  state do
    field(:review_instructions, String.t() | nil)
  end

  command :update_settings do
    payload do
      field(:review_instructions, String.t() | nil)
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(_params, socket), do: {:ok, socket}

  @impl Musubi.Store
  @spec render(Socket.t()) :: %{review_instructions: String.t() | nil}
  def render(_socket) do
    %{review_instructions: SettingsContext.get_settings().review_instructions}
  end

  @impl Musubi.Store
  @spec handle_command(:update_settings, map(), Socket.t()) ::
          {:reply, %{error: String.t() | nil}, Socket.t()}
  def handle_command(:update_settings, payload, socket) do
    params = %{review_instructions: payload["review_instructions"]}

    reply =
      case SettingsContext.update_settings(params) do
        {:ok, %Settings{}} -> %{error: nil}
        {:error, %Ecto.Changeset{}} -> %{error: "invalid_instructions"}
      end

    {:reply, reply, touch(socket)}
  end

  # Musubi re-renders on assign, and `render/1` reads straight from the context,
  # so a bumped revision is what makes the write reach the open modal.
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())
end
