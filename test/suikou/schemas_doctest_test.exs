defmodule Suikou.SchemasDoctestTest do
  use ExUnit.Case, async: true

  doctest Suikou.Schemas.Artifact
  doctest Suikou.Schemas.Round
  doctest Suikou.Schemas.Comment
  doctest Suikou.Schemas.Review
  doctest Suikou.Schemas.Submission
  doctest Suikou.Schemas.Reply
end
