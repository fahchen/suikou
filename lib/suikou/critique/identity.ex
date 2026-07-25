defmodule Suikou.Critique.Identity do
  @moduledoc """
  Who wrote a piece of critique. Comments, replies, and reactions each carry an
  author kind (`:human` / `:agent`) plus a name and icon naming the individual
  agent, since several agents review one round and the kind alone no longer
  identifies a speaker (see BDR-0026).

  The human reviewer is the one fixed identity: there is exactly one of them, so
  they always read under the reserved name `"human"` rather than naming
  themselves per call. That name is theirs alone — an agent claiming it is
  rejected, so nothing an agent writes can be mistaken for the reviewer's own
  word.

  An agent must name itself on every call. The name is the agent's own choice —
  a role, a handle, anything but the reserved one; it need not be the model's
  name. Names and icons arrive as free text, so they are normalized and checked
  here, at the boundary, before they reach a struct — the authoring paths set
  these fields programmatically and never cast them.
  """

  @name_max_graphemes 40
  @icon_max_graphemes 8
  @human_name "human"

  @type kind() :: :human | :agent

  @typedoc "Normalized identity fields, ready to set on a schema struct."
  @type t() :: %{name: String.t(), icon: String.t()}

  @typedoc "Why a self-supplied agent name was refused."
  @type error() :: :agent_name_required | :agent_name_reserved

  @typedoc "The agent-facing and client-facing shape, with a blank icon as `nil`."
  @type view() :: %{kind: kind(), name: String.t() | nil, icon: String.t() | nil}

  @doc """
  Normalizes an agent's self-supplied name and icon into the fields to set on the
  row. The name is required — several agents share a review and an unnamed one
  makes its thread unreadable — and may not be the reviewer's reserved `"human"`,
  compared case-insensitively so `"Human"` is refused too. The icon is optional.
  Truncation counts graphemes, so a cut never lands mid-codepoint.

  ## Examples

      iex> Suikou.Critique.Identity.agent("Codex", "🤖")
      {:ok, %{name: "Codex", icon: "🤖"}}

      iex> Suikou.Critique.Identity.agent("  Codex  ", " ")
      {:ok, %{name: "Codex", icon: ""}}

      iex> Suikou.Critique.Identity.agent(nil, nil)
      {:error, :agent_name_required}

      iex> Suikou.Critique.Identity.agent("Human", "🤖")
      {:error, :agent_name_reserved}

  """
  @spec agent(String.t() | nil, String.t() | nil) :: {:ok, t()} | {:error, error()}
  def agent(name, icon) do
    case normalize(name, @name_max_graphemes) do
      "" -> {:error, :agent_name_required}
      agent_name -> claim(agent_name, icon)
    end
  end

  defp claim(agent_name, icon) do
    if String.downcase(agent_name) == @human_name do
      {:error, :agent_name_reserved}
    else
      {:ok, %{name: agent_name, icon: normalize(icon, @icon_max_graphemes)}}
    end
  end

  @doc """
  Builds the identity view emitted to agents (export/wait) and to the client.
  The human always answers under their reserved name and carries no icon — their
  glyph is a local display preference, not review state. An agent answers under
  the name it wrote with; rows written before names were required have `nil`.

  ## Examples

      iex> Suikou.Critique.Identity.view(:agent, "Codex", "🤖")
      %{kind: :agent, name: "Codex", icon: "🤖"}

      iex> Suikou.Critique.Identity.view(:human, "", "")
      %{kind: :human, name: "human", icon: nil}

  """
  @spec view(kind(), String.t(), String.t()) :: view()
  def view(:human, _name, _icon), do: %{kind: :human, name: @human_name, icon: nil}

  def view(:agent, name, icon) do
    %{kind: :agent, name: blank_to_nil(name), icon: blank_to_nil(icon)}
  end

  defp normalize(value, max_graphemes) when is_binary(value) do
    value |> String.trim() |> String.slice(0, max_graphemes)
  end

  defp normalize(_absent, _max_graphemes), do: ""

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(value), do: value
end
