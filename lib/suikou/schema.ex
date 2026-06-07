defmodule Suikou.Schema do
  @moduledoc """
  Base schema for the application. Use this instead of `EctoTypedSchema`
  directly so every schema shares strictly monotonic, time-ordered UUID v7
  primary keys and UUID foreign keys (see RFC 9562), and `Ecto.Changeset`
  imported for the changeset builders every schema defines. Monotonic precision
  keeps `order_by: :id` equal to insertion order even for sub-millisecond
  inserts, which the reply/comment threads rely on.

      defmodule Suikou.Schemas.Artifact do
        use Suikou.Schema

        typed_schema "artifacts" do
          field :title, :string, typed: [null: false]
        end
      end
  """

  @doc false
  defmacro __using__(_opts) do
    quote do
      use EctoTypedSchema

      import Ecto.Changeset

      @primary_key {:id, Ecto.UUID, autogenerate: [version: 7, precision: :monotonic]}
      @foreign_key_type Ecto.UUID
    end
  end
end
