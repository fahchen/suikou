defmodule SuikouWeb.AgentCLI.ServerTest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureIO

  alias SuikouWeb.AgentCLI.Server
  alias SuikouWeb.Endpoint

  describe "url/0" do
    test "emits the endpoint's configured canonical URL" do
      assert %{"url" => url, "error" => nil} = run(%{}, &Server.url/0)
      assert url == Endpoint.url()
    end
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end
