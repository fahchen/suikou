import { useState } from "react"

import { useMusubiConnectionStatus, useMusubiRoot } from "../musubi"
import { ProjectBoard } from "./ProjectBoard"
import { ArtifactNavProvider, ReviewStoreProvider } from "./store-context"
import { ReviewSurface } from "./ReviewSurface"

/** Waits for the socket, then routes between the project board and a mounted review. */
export function ReviewApp() {
  const connection = useMusubiConnectionStatus()

  if (connection.state === "connecting") return <Centered>Connecting…</Centered>
  if (connection.state === "error") return <Centered tone="error">{connection.error.message}</Centered>

  return <Router />
}

function Router() {
  const [artifactId, setArtifactId] = useState<string | null>(null)

  if (!artifactId) return <ProjectBoard onOpen={setArtifactId} />

  return (
    <ArtifactNavProvider select={setArtifactId}>
      <MountedReview key={artifactId} artifactId={artifactId} />
    </ArtifactNavProvider>
  )
}

function MountedReview({ artifactId }: { artifactId: string }) {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: artifactId,
    params: { artifact_id: artifactId }
  })

  if (root.status === "loading") return <Centered>Connecting…</Centered>
  if (root.status === "error") return <Centered tone="error">{root.error.message}</Centered>

  return (
    <ReviewStoreProvider store={root.store}>
      <ReviewSurface />
    </ReviewStoreProvider>
  )
}

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>{props.children}</span>
    </div>
  )
}
