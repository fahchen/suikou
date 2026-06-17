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

  Atoms become their string form; a changeset becomes `"field message, …"`,
  mirroring the stores' existing `review_error/1`.

  ## Examples

      SuikouWeb.AgentCLI.error(:review_not_found)
      #=> "review_not_found"

  """
  @spec error(atom() | Ecto.Changeset.t()) :: String.t()
  def error(reason) when is_atom(reason), do: Atom.to_string(reason)

  def error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end
end
