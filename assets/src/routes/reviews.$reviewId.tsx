import { createFileRoute } from "@tanstack/react-router"

import { ReviewPage } from "../review/ReviewPage"

export const Route = createFileRoute("/reviews/$reviewId")({
  validateSearch: (search: Record<string, unknown>): { file?: string } => ({
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: ReviewRoute,
})

function ReviewRoute() {
  const { reviewId } = Route.useParams()
  const { file } = Route.useSearch()
  return <ReviewPage reviewId={reviewId} file={file} />
}
