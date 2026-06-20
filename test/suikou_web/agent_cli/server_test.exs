defmodule SuikouWeb.AgentCLI.ServerTest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureIO

  alias SuikouWeb.AgentCLI.Server

  describe "base_url/0" do
    test "builds a local http URL with the endpoint's bound port" do
      url = Server.base_url()

      assert url =~ ~r"^http://[^/]+:\d+$"
    end
  end

  describe "url/0" do
    test "emits the board root URL" do
      assert %{"url" => url, "error" => nil} = run(%{}, &Server.url/0)
      assert url == Server.base_url()
    end
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end
