defmodule SuikouWeb.AgentCLI do
  @moduledoc """
  Shared runtime for the agent CLI delivery boundary.

  Each `AgentCLI.*` command function executes inside the running node (via the
  release `rpc`), reads a JSON payload from the forwarded stdin, calls a backend
  context, and prints a JSON result to stdout. This module holds only the
  transport plumbing those commands share: decoding the stdin payload, encoding
  results, and formatting backend errors. It carries no command logic.

  Uses Jason rather than the stdlib `JSON` module: the project targets Elixir
  `~> 1.15` where `JSON` is not guaranteed, so Jason is the project-wide
  exception (see `docs/planning/agent-cli-plan.md`).
  """

  alias Suikou.Critique

  @typedoc "A string-keyed payload decoded from the command's stdin."
  @type payload() :: %{optional(String.t()) => term()}

  @doc """
  Reads the whole stdin and decodes it as a string-keyed JSON map.

  Zero-arg commands still pipe `{}` so this always has something to decode.

  ## Examples

      # stdin carries: {"review_id": "0192…"}
      SuikouWeb.AgentCLI.read_payload()
      #=> %{"review_id" => "0192…"}

  """
  @spec read_payload() :: payload()
  def read_payload do
    :stdio |> IO.read(:eof) |> Jason.decode!()
  end

  @doc """
  Reads the calling agent's identity off a payload's `"as"` / `"icon"` keys.

  Several agents review one review at a time, so every write a command makes is
  attributed to the name the agent passed. `"as"` is required and may not be the
  reviewer's reserved name; `"icon"` is optional.

  ## Examples

      SuikouWeb.AgentCLI.identity(%{"as" => "Codex", "icon" => "🤖"})
      #=> {:ok, %{name: "Codex", icon: "🤖"}}

      SuikouWeb.AgentCLI.identity(%{})
      #=> {:error, :agent_name_required}

  """
  @spec identity(payload()) :: {:ok, Critique.identity()} | {:error, Critique.identity_error()}
  def identity(payload) do
    Critique.agent_identity(payload["as"], payload["icon"])
  end

  @doc """
  Encodes `map` as JSON and writes it to stdout as one line.

  ## Examples

      SuikouWeb.AgentCLI.emit(%{review_id: "0192…"})
      #=> :ok

  """
  @spec emit(map()) :: :ok
  def emit(map) do
    # `IO.write` with an explicit newline rather than `IO.puts` (lint rule), so
    # the launcher still reads exactly one JSON line.
    IO.write([Jason.encode!(map, escape: :unicode_safe), ?\n])
  end

  @doc """
  Renders a backend error reason as a human-readable string for the JSON result.

  Atoms become their string form; a changeset becomes `"field message, …"`.

  Walks nested changesets, so an invalid embed reports `"anchor.start_line must
  be greater than 0"` rather than the empty string a top-level-only read gives —
  a comment's anchor is an embed, and its errors are the ones an agent most needs
  to see.

  ## Examples

      SuikouWeb.AgentCLI.error(:review_not_found)
      #=> "review_not_found"

      SuikouWeb.AgentCLI.error(changeset_with_a_bad_anchor)
      #=> "anchor.start_line must be greater than 0"

  """
  @spec error(atom() | Ecto.Changeset.t()) :: String.t()
  def error(reason) when is_atom(reason), do: Atom.to_string(reason)

  def error(%Ecto.Changeset{} = changeset) do
    changeset |> messages("") |> Enum.join(", ")
  end

  # Walks `changes` for child changesets rather than using
  # `Ecto.Changeset.traverse_errors/2`: that only descends fields Ecto knows are
  # embeds, and a polymorphic embed is registered as a custom type, so an anchor's
  # errors are invisible to it. Reading `changes` catches both kinds.
  defp messages(%Ecto.Changeset{} = changeset, prefix) do
    own =
      Enum.map(changeset.errors, fn {field, error} ->
        "#{prefix}#{field} #{interpolate(error)}"
      end)

    own ++ Enum.flat_map(changeset.changes, &nested_messages(&1, prefix))
  end

  defp nested_messages({field, %Ecto.Changeset{} = child}, prefix) do
    messages(child, "#{prefix}#{field}.")
  end

  defp nested_messages({field, values}, prefix) when is_list(values) do
    values
    |> Enum.filter(&is_struct(&1, Ecto.Changeset))
    |> Enum.flat_map(&messages(&1, "#{prefix}#{field}."))
  end

  defp nested_messages(_change, _prefix), do: []

  # Ecto stores a message as a template plus its options (`"should be at least
  # %{count} character(s)"`), so substitute them by name. Plain string
  # replacement — no atoms are minted from the captured key.
  defp interpolate({message, opts}) do
    Enum.reduce(opts, message, fn {key, value}, acc ->
      String.replace(acc, "%{#{key}}", to_string(value))
    end)
  end
end
