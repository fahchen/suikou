defmodule Suikou.Critique.Identity do
  @moduledoc """
  Who wrote a piece of critique. Comments, replies, and reactions each carry an
  author kind (`:human` / `:agent`) plus a name and icon naming the individual
  agent, since several agents review one round and the kind alone no longer
  identifies a speaker (see BDR-0026).

  An agent names itself on each command rather than registering up front, so the
  name and icon arrive as free text and are normalized here — at the boundary,
  before they reach the struct — rather than validated in a changeset: the
  authoring paths set these fields programmatically and never cast them.

  The human reviews anonymously: their rows keep the schema default `""`, which
  `view/3` renders back as `nil`.
  """

  @name_max_graphemes 40
  @icon_max_graphemes 8

  @type kind() :: :human | :agent

  @typedoc "Normalized identity fields, ready to set on a schema struct."
  @type t() :: %{name: String.t(), icon: String.t()}

  @typedoc "The agent-facing and client-facing shape, with blanks as `nil`."
  @type view() :: %{kind: kind(), name: String.t() | nil, icon: String.t() | nil}

  @doc """
  Normalizes an agent-supplied name and icon into the fields to set on the row.
  A missing, blank, or over-long value collapses to `""` or is truncated, so an
  agent that omits `--as` still writes a valid (anonymous) row. Truncation
  counts graphemes, so a cut never lands mid-codepoint.

  ## Examples

      iex> Suikou.Critique.Identity.agent("Codex", "🤖")
      %{name: "Codex", icon: "🤖"}

      iex> Suikou.Critique.Identity.agent(nil, nil)
      %{name: "", icon: ""}

      iex> Suikou.Critique.Identity.agent("  Codex  ", " ")
      %{name: "Codex", icon: ""}

  """
  @spec agent(String.t() | nil, String.t() | nil) :: t()
  def agent(name, icon) do
    %{name: normalize(name, @name_max_graphemes), icon: normalize(icon, @icon_max_graphemes)}
  end

  @doc """
  Builds the identity view emitted to agents (export/wait) and to the client.
  A blank stored name or icon becomes `nil`, so a consumer tells "unnamed" from
  "named" without knowing that `""` is the anonymous sentinel.

  ## Examples

      iex> Suikou.Critique.Identity.view(:agent, "Codex", "🤖")
      %{kind: :agent, name: "Codex", icon: "🤖"}

      iex> Suikou.Critique.Identity.view(:human, "", "")
      %{kind: :human, name: nil, icon: nil}

  """
  @spec view(kind(), String.t(), String.t()) :: view()
  def view(kind, name, icon) do
    %{kind: kind, name: blank_to_nil(name), icon: blank_to_nil(icon)}
  end

  defp normalize(value, max_graphemes) when is_binary(value) do
    value |> String.trim() |> String.slice(0, max_graphemes)
  end

  defp normalize(_absent, _max_graphemes), do: ""

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(value), do: value
end
