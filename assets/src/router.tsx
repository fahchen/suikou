import { createRouter } from "@tanstack/react-router"

import { ErrorOverlay } from "./components/error-overlay"
import { NotFound } from "./components/not-found"
import { debug } from "./debug"
import { routeTree } from "./routeTree.gen"

// In debug mode, replace the router's built-in route-error UI with the overlay
// (stack + one-tap copy). Off (normal users): keep the default graceful UI.
export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: debug
    ? ({ error, info }) => <ErrorOverlay error={error} componentStack={info?.componentStack} />
    : undefined
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
