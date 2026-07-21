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

  The human vocabulary is a fixed approval/opposition scale (`human_emojis/0`);
  the agent may react with **any** emoji glyph (a free-form work-status signal),
  so `emoji` is stored as a plain string rather than an enum.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply

  @human_emojis ~w(strong_agree agree disagree strong_disagree)
  @agent_emoji_max_bytes 32
  @actors [:human, :agent]

  @type emoji() :: String.t()
  @type actor() :: :human | :agent

  typed_schema "reactions" do
    field :emoji, :string, typed: [null: false]
    field :actor, Ecto.Enum, values: @actors, typed: [null: false]

    belongs_to :comment, Comment
    belongs_to :reply, Reply

    timestamps()
  end

  @doc """
  Returns the fixed human reaction keys in canonical order. The frontend maps
  each key to its emoji glyph and renders human reaction chips in this order;
  agent chips carry a free-form glyph and render it verbatim.

  ## Examples

      iex> Suikou.Schemas.Reaction.human_emojis()
      ["strong_agree", "agree", "disagree", "strong_disagree"]

  """
  @spec human_emojis() :: [String.t()]
  def human_emojis, do: @human_emojis

  @doc """
  Builds a changeset for a reaction on `reaction` (a struct that already carries
  the programmatic `actor`, set when the struct is built), casting `comment_id`,
  `reply_id`, and `emoji` from `params`. A reaction targets exactly one of a
  comment or a reply; this changeset-level check mirrors the DB constraint.
  `emoji` arrives as a string. A **human** reaction must be one of the fixed
  approval/opposition keys (`human_emojis/0`); an **agent** reaction may be any
  non-empty glyph up to #{@agent_emoji_max_bytes} bytes, so the agent can signal
  work status with whatever emoji it likes.

  ## Examples

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{reply_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :agent}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "🚀"}).valid?
      true

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", reply_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "strong_agree"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{emoji: "strong_agree"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :human}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: "🚀"}).valid?
      false

      iex> reaction = %Suikou.Schemas.Reaction{actor: :agent}
      iex> Suikou.Schemas.Reaction.changeset(reaction, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", emoji: ""}).valid?
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

  defp validate_emoji_for_actor(changeset, :human) do
    validate_inclusion(changeset, :emoji, @human_emojis, message: "not allowed for this actor")
  end

  defp validate_emoji_for_actor(changeset, :agent) do
    validate_length(changeset, :emoji, min: 1, max: @agent_emoji_max_bytes, count: :bytes)
  end

  defp validate_exactly_one_target(changeset) do
    comment_id = get_field(changeset, :comment_id)
    reply_id = get_field(changeset, :reply_id)

    case {comment_id, reply_id} do
      {nil, nil} ->
        add_error(changeset, :comment_id, "requires a comment or reply target")

      {_comment_id, nil} ->
        changeset

      {nil, _reply_id} ->
        changeset

      {_both, _set} ->
        add_error(changeset, :comment_id, "cannot target both a comment and a reply")
    end
  end
end
