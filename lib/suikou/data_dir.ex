defmodule Suikou.DataDir do
  @moduledoc """
  The per-user directory that holds the install's database and credentials.

  Test and dev point it elsewhere through `config :suikou, :cli_data_dir` or
  the `SUIKOU_DATA_DIR` environment variable, so a dev server never overwrites
  the packaged install's data.
  """

  @doc """
  Returns the data directory shared by the domain contexts and the web layer.
  """
  @spec path() :: Path.t()
  def path do
    Application.get_env(:suikou, :cli_data_dir) || System.get_env("SUIKOU_DATA_DIR") ||
      Path.join([System.user_home!(), "Library", "Application Support", "Suikou"])
  end
end
