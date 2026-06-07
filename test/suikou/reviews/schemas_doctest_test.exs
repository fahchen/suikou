defmodule Suikou.Reviews.SchemasDoctestTest do
  use ExUnit.Case, async: true

  doctest Suikou.Reviews.Schemas.Artifact
  doctest Suikou.Reviews.Schemas.Round
  doctest Suikou.Reviews.Schemas.Comment
  doctest Suikou.Reviews.Schemas.Review
  doctest Suikou.Reviews.Schemas.Reply
end
