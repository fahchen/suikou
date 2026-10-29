defmodule SuikouWeb.Router do
  use SuikouWeb, :router

  # No content negotiation: asset responses carry the file's own media type.
  pipeline :asset do
  end

  pipeline :browser do
    plug :accepts, ["html"]
  end

  # The loopback agent CLI: every route takes the command's JSON payload as its
  # body and answers with the same JSON the rpc transport used to print. The
  # token plug rejects any caller without the data directory's secret, so only
  # this user's CLI can drive the server.
  pipeline :cli do
    plug :accepts, ["json"]
    plug SuikouWeb.CLITokenPlug
  end

  scope "/api/cli", SuikouWeb.CLI do
    pipe_through :cli

    post "/project/list", ProjectController, :list
    post "/project/create", ProjectController, :create

    post "/review/list", ReviewController, :list
    post "/review/create", ReviewController, :create
    post "/review/show", ReviewController, :show
    post "/review/list-files", ReviewController, :files
    # `review open` uses this route and opens the URL client-side.
    post "/review/url", ReviewController, :url
    post "/review/rename", ReviewController, :rename
    post "/review/set-files", ReviewController, :set_files
    post "/review/set-stack", ReviewController, :set_stack
    post "/review/add-files", ReviewController, :add_files
    post "/review/remove-files", ReviewController, :remove_files
    post "/review/delete", ReviewController, :delete
    post "/review/export", ReviewController, :export
    post "/review/wait", ReviewController, :wait
    post "/review/notify", ReviewController, :notify

    post "/comment/add", CommentController, :add
    post "/comment/reply", CommentController, :reply
    post "/comment/resolve", CommentController, :resolve
    post "/comment/reopen", CommentController, :reopen
    post "/comment/react", CommentController, :react
    post "/comment/unreact", CommentController, :unreact

    post "/reply/react", ReplyController, :react
    post "/reply/unreact", ReplyController, :unreact

    post "/server/url", ServerController, :url
    post "/server/pid", ServerController, :pid
    post "/server/stop", ServerController, :stop
  end

  scope "/api", SuikouWeb do
    pipe_through :asset

    get "/review/:artifact_id/content", AssetController, :content
    get "/review/:artifact_id/asset/*path", AssetController, :show
    get "/review/:review_id/files/content", AssetController, :file_content
    get "/review/:review_id/files/raw", AssetController, :file_raw
    get "/review/:review_id/commits", AssetController, :commits
    get "/review/:review_id/files", AssetController, :files

    # PWA Web Push: the frontend reads the push config (VAPID key + whether the
    # subject is set), then registers/drops its browser subscription. Placed
    # before the catch-all so the GET isn't swallowed.
    get "/push/config", PushController, :config
    post "/push/subscribe", PushController, :subscribe
    delete "/push/subscribe", PushController, :unsubscribe

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
