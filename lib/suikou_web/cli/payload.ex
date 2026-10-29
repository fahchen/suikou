defmodule SuikouWeb.CLI.Payload do
  @moduledoc """
  Shared plumbing for the loopback CLI API controllers: the body of a CLI
  request is the command's payload, decoded JSON with string keys — exactly the
  shape `SuikouWeb.AgentCLI` commands take.
  """

  @doc """
  The request body as a string-keyed payload map. A body that decoded to
  something other than a JSON object (a list, a bare string) cannot carry a
  payload, so it reads as empty — the command then answers with its missing-
  input error instead of crashing on `payload["…"]`.
  """
  @spec payload(Plug.Conn.t()) :: SuikouWeb.AgentCLI.payload()
  def payload(%Plug.Conn{body_params: params}) when is_map(params), do: params
  def payload(_conn), do: %{}
end
