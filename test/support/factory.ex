defmodule Suikou.Factory do
  @moduledoc false

  use ExMachina.Ecto, repo: Suikou.Repo
  use Suikou.Factories.ReviewFactory
end
