import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { StoreProxy } from "@musubi/react"

import { storeCache, useMusubiCommand, useMusubiRoot } from "../musubi"
import { Centered, ReviewShellSkeleton } from "../review/ArtifactReviewShell"
import { reviewFileTarget } from "../review/review-navigation"

export const Route = createFileRoute("/reviews/$reviewId/")({
  component: ReviewLandingRoute
})

function ReviewLandingRoute() {
  const { reviewId } = Route.useParams()
  const navigate = useNavigate()
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {},
    cache: storeCache
  })
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "empty" }
  >({ status: "loading" })

  if (root.status === "loading") return <ReviewShellSkeleton label="Loading review…" />
  if (root.status === "error") return <Centered tone="error">{root.error.message}</Centered>

  return (
    <ReviewLandingResolver
      reviewId={reviewId}
      navigate={navigate}
      store={root.store}
      state={state}
      onStateChange={setState}
    />
  )
}

function ReviewLandingResolver(props: {
  reviewId: string
  navigate: ReturnType<typeof useNavigate>
  store: StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>
  state:
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "empty" }
  onStateChange: React.Dispatch<
    React.SetStateAction<
      { status: "loading" } | { status: "error"; message: string } | { status: "empty" }
    >
  >
}) {
  const listReviewFiles = useMusubiCommand(props.store, "list_review_files")

  useEffect(() => {
    let cancelled = false

    props.onStateChange({ status: "loading" })
    void listReviewFiles
      .dispatch({ review_id: props.reviewId })
      .then((reply) => {
        if (cancelled) return
        if (reply.error) {
          props.onStateChange({ status: "error", message: reply.error })
          return
        }
        const first = reply.files[0]
        if (!first) {
          props.onStateChange({ status: "empty" })
          return
        }
        void props.navigate({
          ...reviewFileTarget(props.reviewId, first.path, false),
          replace: true
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        props.onStateChange({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load review files"
        })
      })

    return () => {
      cancelled = true
    }
  }, [props.reviewId])

  if (props.state.status === "loading") {
    return <ReviewShellSkeleton label="Loading review…" />
  }
  if (props.state.status === "error") {
    return <Centered tone="error">{props.state.message}</Centered>
  }
  return (
    <Centered>
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <strong className="text-heading">No files in this review</strong>
        <span className="text-muted-foreground">This review does not currently cover any files.</span>
      </div>
    </Centered>
  )
}
