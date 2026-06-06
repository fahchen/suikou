defmodule Suikou.Repo do
  use Ecto.Repo,
    otp_app: :suikou,
    adapter: Ecto.Adapters.SQLite3
end
