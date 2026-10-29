defmodule SuikouWeb.AgentCLI.ServerTest do
  use ExUnit.Case, async: true

  alias SuikouWeb.AgentCLI.Server
  alias SuikouWeb.Endpoint

  describe "url/1" do
    test "emits the endpoint's configured canonical URL" do
      assert %{"url" => url, "error" => nil} = run(%{}, &Server.url/1)
      assert url == Endpoint.url()
    end
  end

  defp run(payload, fun) do
    payload
    |> Jason.encode!()
    |> Jason.decode!()
    |> then(fun)
    |> Jason.encode!()
    |> Jason.decode!()
  end
end
