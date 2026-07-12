import { createFileRoute } from "@tanstack/react-router"

import { ReviewPage } from "../review/ReviewPage"

type ReviewSearch = { file?: string; lens?: "staged" | "unstaged"; commits?: string[] }

export const Route = createFileRoute("/reviews/$reviewId")({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => {
    const commitsRaw = Array.isArray(search.commits)
      ? search.commits.filter((c): c is string => typeof c === "string")
      : typeof search.commits === "string" && search.commits
        ? search.commits.split(",").filter(Boolean)
        : []
    // A concrete commit selection and a working-tree lens are mutually
    // exclusive (BDR-0025); commits win if a malformed URL carries both.
    const commits = commitsRaw.length > 0 ? commitsRaw : undefined
    const lens = !commits && (search.lens === "staged" || search.lens === "unstaged") ? search.lens : undefined
    return {
      file: typeof search.file === "string" && search.file ? search.file : undefined,
      lens,
      commits,
    }
  },
  component: ReviewRoute,
})

function ReviewRoute() {
  const { reviewId } = Route.useParams()
  const { file, lens, commits } = Route.useSearch()
  return <ReviewPage reviewId={reviewId} file={file} lens={lens} commits={commits} />
}
