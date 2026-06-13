defmodule Suikou.Schemas.Anchor.ElementTest do
  use ExUnit.Case, async: true

  alias Suikou.Schemas.Anchor.Element

  doctest Element

  describe "changeset/2" do
    test "accepts a selector with the captured quote" do
      params = %{selector: "main > p:nth-of-type(2)", quote: "Hello"}

      assert %Ecto.Changeset{valid?: true} = Element.changeset(%Element{}, params)
    end

    test "rejects a missing selector" do
      params = %{quote: "Hello"}

      assert %Ecto.Changeset{valid?: false, errors: errors} =
               Element.changeset(%Element{}, params)

      assert {"can't be blank", _} = errors[:selector]
    end

    test "rejects a missing quote" do
      params = %{selector: "main > p"}

      assert %Ecto.Changeset{valid?: false, errors: errors} =
               Element.changeset(%Element{}, params)

      assert {"can't be blank", _} = errors[:quote]
    end
  end
end
