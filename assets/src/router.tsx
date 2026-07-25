import { createRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { AlertTriangle, Compass, RefreshCw } from "lucide-react"

import { FileNotice } from "./review/components/EditorSurface"
import { reloadForFreshShell, staleShellError } from "./lib/stale-shell"
import { errorLogStore } from "./stores/error-log-store"
import { routeTree } from "./routeTree.gen"

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
})

const BackToProjects = (
  <a
    href="/"
    className="inline-flex h-[30px] items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-3 text-xs font-semibold text-ink hover:bg-soft"
  >
    Back to projects
  </a>
)

function NotFoundPage() {
  return (
    <div className="grid h-screen place-items-center bg-canvas">
      <FileNotice
        icon={Compass}
        title="Page not found"
        body="This link doesn't point to a review or project. It may have been moved or removed."
        action={BackToProjects}
      />
    </div>
  )
}

function RouteErrorPage({ error }: ErrorComponentProps) {
  // A render failure never reaches the window listeners, so the boundary is the
  // only place it can be recorded. Logged before the stale-shell branch below,
  // which navigates away and would otherwise lose it. `record` ignores this
  // while collecting is off, so there is nothing to check here.
  errorLogStore.record({
    kind: "render",
    message: error.message,
    source: "route error boundary",
    stack: error.stack ?? "",
  })

  // A chunk this tab's shell expects but the deployed build no longer ships:
  // reload onto the current one rather than blaming the user's page. Rate-limited
  // inside, so a build that really is missing the chunk falls through to the
  // error below instead of reloading on a loop.
  if (staleShellError(error) && reloadForFreshShell()) {
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <FileNotice icon={RefreshCw} title="Updating…" body="A newer version is loading." />
      </div>
    )
  }

  return (
    <div className="grid h-screen place-items-center bg-canvas">
      <FileNotice
        icon={AlertTriangle}
        title="Something went wrong"
        body="This page hit an unexpected error. Reloading may help."
        tone="request"
        meta={error.message}
        action={BackToProjects}
      />
    </div>
  )
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
