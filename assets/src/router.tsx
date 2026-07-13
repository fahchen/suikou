import { createRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { AlertTriangle, Compass } from "lucide-react"

import { FileNotice } from "./review/components/EditorSurface"
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
