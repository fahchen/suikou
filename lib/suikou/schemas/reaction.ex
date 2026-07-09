defmodule Suikou.Schemas.Reaction do
  @moduledoc """
  An emoji an actor applies to a comment or a reply. Both the human reviewer and
  the agent may react (see BDR-0018's deliberate extension of the "agent may only
  reply" boundary), so a reaction carries an `actor`.

  A reaction targets exactly one of a comment or a reply: `comment_id` and
  `reply_id` are both nullable, but a DB check constraint requires exactly one to
  be set, mirrored by `changeset/2`. `actor` is set by the reaction path when the
  struct is built, never cast from input; `emoji` and the target id are cast.
  Each actor holds at most one reaction per target: a `(comment_id, actor)` pair
  (or `(reply_id, actor)`) is unique, so picking a new emoji replaces the actor's
  previous one in place rather than adding a row.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply

  @emojis [:strong_agree, :agree, :disagree, :strong_disagree, :eyes, :thinking, :check]
  @human_emojis [:strong_agree, :agree, :disagree, :strong_disagree]
  @agent_emojis [:eyes, :thinking, :check]
  @actors [:human, :agent]

  @type emoji() ::
          :strong_agree | :agree | :disagree | :strong_disagree | :eyes | :thinking | :check
  @type actor() :: :human | :agent

  typed_schema "reactions" do
    field :emoji, Ecto.Enum, values: @emojis, typed: [null: false]
    field :actor, Ecto.Enum, values: @actors, typed: [null: false]

    belongs_to :comment, Comment
    belongs_to :reply, Reply

    timestamps()
  end

  @doc """
  Returns the allowed reaction emojis in canonical order. The frontend maps each
  key to its emoji glyph and renders reaction chips in this order.

  ## Examples

      iex> Suikou.Schemas.Reaction.emojis()
      [:strong_agree, :agree, :disagree, :strong_disagree, :eyes, :thinking, :check]

  """
  @spec emojis() :: [emoji()]
  def emojis, do: @emojis

  @doc """
  Returns the emojis a human reviewer may apply. Disjoint from `agent_emojis/0`,
  so the frontend derives the reacting actor from the emoji itself.

  ## Examples

      iex> Suikou.Schemas.Reaction.human_emojis()
      [:strong_agree, :agree, :disagree, :strong_disagree]

  """
  @spec human_emojis() :: [emoji()]
  def human_emojis, do: @human_emojis

  @doc """
  Returns the emojis an agent may apply. Disjoint from `human_emojis/0`, so the
  frontend derives the reacting actor from the emoji itself.

  ## Examples

      iex> Suikou.Schemas.Reaction.agent_emojis()
      [:eyes, :thinking, :check]

  """
  @spec agent_emojis() :: [emoji()]
  def agent_emojis, do: @agent_emojis

  @doc """
  Builds a changeset for a reaction on `reaction` (a struct that already carries
  the programmatic `actor`, set when the struct is built), casting `comment_id`,
  `reply_id`, and `emoji` from `params`. A reaction targets exactly one of a
  comment or a reply; this changeset-level check mirrors the DB constraint.
  `emoji` arrives as a string from the store payload; the `Ecto.Enum` field
  validates and coerces it to the atom. The emoji must also belong to the
  reaction's actor vocabulary (`human_emojis/0` or `agent_emojis/0`), which are
  disjoint, so a human cannot apply an agent emoji and vice versa.

  ## Examples

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{reply_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :agent}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "eyes"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", reply_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{emoji: "strong_agree"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "eyes"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "nope"}).valid?
      false

  """
  @spec changeset(Ecto.Schema.t(), map()) :: Ecto.Changeset.t()
  def changeset(reaction, params) do
    reaction
    |> cast(params, [:comment_id, :reply_id, :emoji])
    |> validate_required([:emoji])
    |> validate_exactly_one_target()
    |> validate_emoji_for_actor(reaction.actor)
  end

  defp validate_emoji_for_actor(changeset, actor) do
    allowed =
      case actor do
        :human -> @human_emojis
        :agent -> @agent_emojis
      end

    case get_field(changeset, :emoji) do
      nil ->
        changeset

      emoji ->
        if emoji in allowed,
          do: changeset,
          else: add_error(changeset, :emoji, "not allowed for this actor")
    end
  end

  defp validate_exactly_one_target(changeset) do
    comment_id = get_field(changeset, :comment_id)
    reply_id = get_field(changeset, :reply_id)

    case {comment_id, reply_id} do
      {nil, nil} ->
        add_error(changeset, :comment_id, "requires a comment or reply target")

      {id, nil} when not is_nil(id) ->
        changeset

      {nil, id} when not is_nil(id) ->
        changeset

      {_both, _set} ->
        add_error(changeset, :comment_id, "cannot target both a comment and a reply")
    end
  end
end
