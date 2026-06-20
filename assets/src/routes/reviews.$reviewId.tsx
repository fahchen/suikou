import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewRoute
})

function ReviewRoute() {
  return <Outlet />
}
