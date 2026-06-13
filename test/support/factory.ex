defmodule Suikou.Factory do
  @moduledoc false

  use ExMachina
  use Suikou.Factories.EctoStrategy, repo: Suikou.Repo
  use Suikou.Factories.ReviewFactory
end
