import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { StoreProxy } from "@musubi/react"

import { storeCache, useMusubiCommand, useMusubiRoot } from "../musubi"
import { ArtifactReviewShell, Centered, ReviewShellSkeleton } from "../review/ArtifactReviewShell"
import { uiStore } from "../stores/ui-store"

export const Route = createFileRoute("/reviews/$reviewId/files/$")({
  component: ReviewFileRoute
})

function ReviewFileRoute() {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {},
    cache: storeCache
  })

  if (root.status === "loading") return <ReviewShellSkeleton label="Opening file…" />
  if (root.status === "error") return <Centered tone="error">{root.error.message}</Centered>

  return <ResolvedReviewFileRoute store={root.store} />
}

function ResolvedReviewFileRoute(props: {
  store: StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>
}) {
  const { reviewId, _splat } = Route.useParams()
  const path = _splat ?? null
  const openReviewFile = useMusubiCommand(props.store, "open_review_file")
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; artifactId: string }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    if (!path) {
      setState({ status: "error", message: "Missing file path" })
      return
    }

    setState({ status: "loading" })
    uiStore.setMintingPath(path)
    void openReviewFile
      .dispatch({ review_id: reviewId, path })
      .then((reply) => {
        if (cancelled) return
        if (!reply.artifact_id) {
          uiStore.setMintingPath(null)
          setState({ status: "error", message: reply.error ?? "Could not open file" })
          return
        }
        setState({ status: "ready", artifactId: reply.artifact_id })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        uiStore.setMintingPath(null)
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not open file"
        })
      })

    return () => {
      cancelled = true
    }
  }, [path, reviewId])

  if (state.status === "loading") {
    return <ReviewShellSkeleton label={`Opening ${path}…`} />
  }
  if (state.status === "error") {
    return <Centered tone="error">{state.message}</Centered>
  }
  return <ArtifactReviewShell artifactId={state.artifactId} />
}
