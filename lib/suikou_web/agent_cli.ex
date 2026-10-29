defmodule SuikouWeb.AgentCLI do
  @moduledoc """
  Shared runtime for the agent CLI delivery boundary.

  Each `AgentCLI.*` command takes a string-keyed payload map — the decoded body
  of its loopback HTTP route (see `SuikouWeb.CLI` and `SuikouWeb.CLI.Payload`) — and returns the JSON
  result map. This module holds only what those commands share: reading the
  calling agent's identity and formatting backend errors. It carries no command
  logic and no transport.

  Uses Jason rather than the stdlib `JSON` module: the project targets Elixir
  `~> 1.15` where `JSON` is not guaranteed, so Jason is the project-wide
  exception (see `docs/planning/agent-cli-plan.md`).
  """

  alias Suikou.Critique

  @typedoc "A string-keyed payload decoded from a request body."
  @type payload() :: %{optional(String.t()) => term()}

  @typedoc "The JSON result map a command returns; the caller encodes it."
  @type result() :: map()

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
  Renders a backend error reason as a human-readable string for the JSON result.

  Atoms become their string form; a reason carrying paths becomes `"reason:
  path, …"`; a changeset becomes `"field message, …"`.

  Walks nested changesets, so an invalid embed reports `"anchor.start_line must
  be greater than 0"` rather than the empty string a top-level-only read gives —
  a comment's anchor is an embed, and its errors are the ones an agent most needs
  to see.

  ## Examples

      SuikouWeb.AgentCLI.error(:review_not_found)
      #=> "review_not_found"

      SuikouWeb.AgentCLI.error({:stack_not_equivalent, ["lib/app.ex", "test/app_test.exs"]})
      #=> "stack_not_equivalent: lib/app.ex, test/app_test.exs"

      SuikouWeb.AgentCLI.error({:stack_base_mismatch, "9f8e7d6c5b4a…", "0a1b2c3d4e5f…"})
      #=> "stack_base_mismatch: the source forks at 9f8e7d6, the stack at 0a1b2c3"

      SuikouWeb.AgentCLI.error(changeset_with_a_bad_anchor)
      #=> "anchor.start_line must be greater than 0"

  """
  @spec error(
          atom()
          | {atom(), atom()}
          | {atom(), [String.t()]}
          | {:stack_base_mismatch, String.t(), String.t() | nil}
          | Ecto.Changeset.t()
        ) :: String.t()
  def error(reason) when is_atom(reason), do: Atom.to_string(reason)

  # A reason that carries detail, e.g. `{:scratch_unwritable, :eacces}`. Both
  # halves are named so the agent can act on the kind and report the cause.
  def error({reason, detail}) when is_atom(reason) and is_atom(detail),
    do: "#{reason}: #{detail}"

  # A reason that names the paths it is about, e.g. a review stack whose tree
  # differs from its source at `{:stack_not_equivalent, paths}`.
  def error({reason, paths}) when is_atom(reason) and is_list(paths),
    do: "#{reason}: #{Enum.join(paths, ", ")}"

  # Names both merge-bases so the agent can see where to re-cut the stack from.
  def error({:stack_base_mismatch, source_fork, nil}),
    do:
      "stack_base_mismatch: the source forks at #{short(source_fork)}, the stack shares no history"

  def error({:stack_base_mismatch, source_fork, stack_fork}),
    do:
      "stack_base_mismatch: the source forks at #{short(source_fork)}, the stack at #{short(stack_fork)}"

  def error(%Ecto.Changeset{} = changeset) do
    changeset |> messages("") |> Enum.join(", ")
  end

  defp short(sha), do: String.slice(sha, 0, 7)

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
