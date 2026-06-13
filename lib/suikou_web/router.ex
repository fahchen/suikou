defmodule SuikouWeb.Router do
  use SuikouWeb, :router

  # No content negotiation: asset responses carry the file's own media type.
  pipeline :asset do
  end

  pipeline :browser do
    plug :accepts, ["html"]
  end

  scope "/api", SuikouWeb do
    pipe_through :asset

    get "/review/:artifact_id/content", AssetController, :content
    get "/review/:artifact_id/asset/*path", AssetController, :show

    # Unmatched API paths 404 here under :asset (no :accepts), so a JSON client
    # gets 404 instead of the 406 the :browser pipeline would raise on Accept.
    get "/*path", SpaController, :not_found
  end

  # SPA fallback: any non-API browser route returns the React shell so
  # client-side routing works on refresh and deep links. Must stay last.
  scope "/", SuikouWeb do
    pipe_through :browser

    get "/*path", SpaController, :index
  end
end
