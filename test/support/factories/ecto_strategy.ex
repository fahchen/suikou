defmodule Suikou.Factories.EctoStrategy do
  @moduledoc false

  # Drop-in replacement for `ExMachina.EctoStrategy` that tolerates fields
  # declared with `polymorphic_embed`. The upstream strategy iterates every
  # `__schema__(:fields)` entry and feeds the existing struct value through
  # `Ecto.Type.cast/2`, but `PolymorphicEmbed.cast/2` always raises by design
  # (the only legitimate call site is `cast_polymorphic_embed/2`). Skipping
  # `cast` for polymorphic_embed fields preserves whatever struct value the
  # factory placed there.

  use ExMachina.Strategy, function_name: :insert

  def handle_insert(%{__meta__: %{state: :loaded}} = record, _opts) do
    raise "You called `insert` on a record that has already been inserted.\n\n#{inspect(record, limit: :infinity)}"
  end

  def handle_insert(_record, %{repo: nil}) do
    raise "insert/1 is not available unless you provide the :repo option."
  end

  def handle_insert(%{__meta__: %{__struct__: Ecto.Schema.Metadata}} = record, %{repo: repo}) do
    record |> cast() |> repo.insert!()
  end

  def handle_insert(record, %{repo: _repo}) do
    raise ArgumentError, "#{inspect(record)} is not an Ecto model. Use `build` instead"
  end

  def handle_insert(_record, _opts) do
    raise "expected :repo to be given to Suikou.Factories.EctoStrategy"
  end

  def handle_insert(
        %{__meta__: %{__struct__: Ecto.Schema.Metadata}} = record,
        %{repo: repo},
        insert_options
      ) do
    record |> cast() |> repo.insert!(insert_options)
  end

  defp cast(record) do
    record
    |> cast_all_fields()
    |> cast_all_embeds()
    |> cast_all_assocs()
  end

  defp cast_all_fields(%{__struct__: schema} = struct) do
    schema
    |> schema_fields()
    |> Enum.reduce(struct, fn field_key, acc ->
      Map.put(acc, field_key, cast_field(field_key, acc))
    end)
  end

  defp cast_field(field_key, %{__struct__: schema} = struct) do
    field_type = schema.__schema__(:type, field_key)
    value = Map.get(struct, field_key)

    cast_value(field_type, value, struct)
  end

  # Hand polymorphic_embed values through untouched — the factory placed a
  # struct of the right variant there, and `PolymorphicEmbed.cast/2` raises
  # rather than accepting it.
  defp cast_value({:parameterized, {PolymorphicEmbed, _params}}, value, _struct), do: value

  defp cast_value(field_type, value, struct) do
    case Ecto.Type.cast(field_type, value) do
      {:ok, casted} ->
        casted

      _error ->
        raise "Failed to cast `#{inspect(value)}` of type #{inspect(field_type)} in #{inspect(struct)}."
    end
  end

  defp cast_all_embeds(%{__struct__: schema} = struct) do
    schema
    |> schema_embeds()
    |> Enum.reduce(struct, fn embed_key, acc ->
      Map.put(acc, embed_key, acc |> Map.get(embed_key) |> cast_embed(embed_key, acc))
    end)
  end

  defp cast_embed(embeds_many, embed_key, struct) when is_list(embeds_many) do
    Enum.map(embeds_many, &cast_embed(&1, embed_key, struct))
  end

  defp cast_embed(embed, embed_key, %{__struct__: schema}) do
    if embed do
      reflection = schema.__schema__(:embed, embed_key)
      reflection.related |> struct() |> Map.merge(embed) |> cast()
    end
  end

  defp cast_all_assocs(%{__struct__: schema} = struct) do
    schema
    |> schema_associations()
    |> Enum.reduce(struct, fn assoc_key, acc ->
      Map.put(acc, assoc_key, acc |> Map.get(assoc_key) |> cast_assoc(assoc_key, acc))
    end)
  end

  defp cast_assoc(has_many_assoc, assoc_key, struct) when is_list(has_many_assoc) do
    Enum.map(has_many_assoc, &cast_assoc(&1, assoc_key, struct))
  end

  defp cast_assoc(assoc, assoc_key, %{__struct__: schema}) do
    case assoc do
      %{__meta__: %{__struct__: Ecto.Schema.Metadata, state: :built}} ->
        cast(assoc)

      %{__struct__: Ecto.Association.NotLoaded} ->
        assoc

      %{__struct__: _struct} ->
        cast(assoc)

      %{} ->
        reflection = schema.__schema__(:association, assoc_key)
        reflection.related |> struct() |> Map.merge(assoc) |> cast()

      nil ->
        nil
    end
  end

  defp schema_fields(schema), do: schema.__schema__(:fields) -- schema.__schema__(:embeds)
  defp schema_embeds(schema), do: schema.__schema__(:embeds)
  defp schema_associations(schema), do: schema.__schema__(:associations)
end
