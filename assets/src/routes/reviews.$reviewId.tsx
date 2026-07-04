import { createFileRoute } from "@tanstack/react-router"

import { ReviewPage } from "../review/ReviewPage"

export const Route = createFileRoute("/reviews/$reviewId")({
  component: ReviewRoute,
})

function ReviewRoute() {
  const { reviewId } = Route.useParams()
  return <ReviewPage reviewId={reviewId} />
}
