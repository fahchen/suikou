defmodule SuikouWeb.Router do
  use SuikouWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # No content negotiation: asset responses carry the file's own media type.
  pipeline :asset do
  end

  pipeline :browser do
    plug :accepts, ["html"]
  end

  scope "/api", SuikouWeb do
    pipe_through :api
  end

  scope "/api", SuikouWeb do
    pipe_through :asset

    get "/review/:artifact_id/content", AssetController, :content
    get "/review/:artifact_id/asset/*path", AssetController, :show
  end

  # SPA fallback: any non-API browser route returns the React shell so
  # client-side routing works on refresh and deep links. Must stay last.
  scope "/", SuikouWeb do
    pipe_through :browser

    get "/*path", SpaController, :index
  end
end
