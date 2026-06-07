import { useEffect, useState } from "react"

import { useMusubiRoot } from "../musubi"
import { ArtifactNavProvider, ReviewStoreProvider } from "./store-context"
import { ReviewSurface } from "./ReviewSurface"

interface ArtifactRef {
  id: string
  title: string
}

type Bootstrap =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; artifactId: string }

/** Discovers a starting artifact id over REST, then mounts the ReviewStore. */
export function ReviewApp() {
  const [boot, setBoot] = useState<Bootstrap>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    fetch("/api/artifacts")
      .then((res) => res.json() as Promise<{ artifacts: ArtifactRef[] }>)
      .then(({ artifacts }) => {
        if (cancelled) return
        const first = artifacts[0]
        setBoot(first ? { status: "ready", artifactId: first.id } : { status: "empty" })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBoot({ status: "error", message: error instanceof Error ? error.message : String(error) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (boot.status === "loading") return <Centered>Loading review…</Centered>
  if (boot.status === "error") return <Centered tone="error">{boot.message}</Centered>
  if (boot.status === "empty") return <Centered>No artifacts to review. Run the seed task.</Centered>

  return <ReviewRoot initialArtifactId={boot.artifactId} />
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
