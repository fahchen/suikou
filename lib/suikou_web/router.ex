defmodule SuikouWeb.Router do
  use SuikouWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SuikouWeb do
    pipe_through :api

    get "/artifacts", ArtifactController, :index
  end
end
