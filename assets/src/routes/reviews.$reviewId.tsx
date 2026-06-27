import { Outlet, createFileRoute } from "@tanstack/react-router"

import { useReconnectEpoch } from "../musubi"

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewRoute
})

// Remount the review subtree on every reconnect: a backgrounded tab's server
// store can be gone on resume (page-server timeout / restart), and musubi's
// in-place recovery can't re-join a store that came back under a new root_id. A
// fresh mount adopts the new id, so comments and verdicts work again instead of
// rejecting "Store is not connected". The SWR cache repaints instantly, so the
// remount has no blank flash.
function ReviewRoute() {
  const epoch = useReconnectEpoch()
  return <Outlet key={epoch} />
}
