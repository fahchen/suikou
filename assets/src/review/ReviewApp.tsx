import { useState } from "react"

import { useMusubiConnectionStatus, useMusubiRoot, useMusubiSnapshot } from "../musubi"
import { ArtifactNavProvider, ReviewStoreProvider } from "./store-context"
import { ReviewSurface } from "./ReviewSurface"

interface InboxSnapshot {
  artifacts: { id: string; title: string }[]
}

/** Waits for the socket, then discovers a starting artifact over the live inbox store. */
export function ReviewApp() {
  const connection = useMusubiConnectionStatus()

  if (connection.state === "connecting") return <Centered>Connecting…</Centered>
  if (connection.state === "error") return <Centered tone="error">{connection.error.message}</Centered>

  return <InboxRoot />
}

function InboxRoot() {
  const inbox = useMusubiRoot({
    module: "SuikouWeb.Stores.ArtifactsInboxStore",
    id: "inbox",
    params: {}
  })

  if (inbox.status === "loading") return <Centered>Loading review…</Centered>
  if (inbox.status === "error") return <Centered tone="error">{inbox.error.message}</Centered>

  return <Inbox store={inbox.store} />
}

function Inbox({ store }: { store: Parameters<typeof useMusubiSnapshot>[0] }) {
  const snapshot = useMusubiSnapshot(store) as unknown as InboxSnapshot
  const first = snapshot.artifacts[0]

  if (!first) return <Centered>No artifacts to review. Run the seed task.</Centered>

  return <ReviewRoot initialArtifactId={first.id} />
}

function ReviewRoot({ initialArtifactId }: { initialArtifactId: string }) {
  const [artifactId, setArtifactId] = useState(initialArtifactId)

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
