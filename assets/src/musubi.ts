import { useCallback, useRef } from "react"
import { Socket } from "phoenix"
import { createStorageCachePersister } from "@musubi/client"
import { createMusubi } from "@musubi/react"

// In dev the Vite ws proxy mangles the Phoenix socket upgrade, so connect
// straight to the Phoenix endpoint (check_origin is disabled in dev). Derive
// the host from the page so remote clients (e.g. over Tailscale) reach the dev
// machine instead of resolving "localhost" to themselves.
const socketUrl = import.meta.env.DEV
  ? `ws://${window.location.hostname}:4010/socket`
  : "/socket"

export const socket = new Socket(socketUrl)

// Persist last-known store state across reloads so a route swap (or a fresh tab)
// paints from cache instead of flashing loading. `buster` is the data-shape
// version: bump it whenever a store's snapshot shape changes so deployed clients
// discard stale entries.
export const storeCache = {
  persister: createStorageCachePersister(localStorage),
  buster: "v1"
}

export const {
  MusubiProvider,
  useMusubiConnection,
  useMusubiConnectionStatus,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand
} = createMusubi<Musubi.Stores>()

// One prefetch per (module|id|params) per page session — hover handlers fire
// many times; dedupe so we mount/unmount the server-side root at most once.
const prefetched = new Set<string>()

/**
 * Returns a hover-friendly prefetcher for a ReviewStore identity. Warms the
 * SWR cache so the first visit to `/review/:artifactId` paints from cache
 * instead of waiting on the initial patch. Subsequent hovers for the same
 * identity are no-ops.
 */
export function usePrefetchReviewStore(): (artifactId: string) => void {
  const connection = useMusubiConnection()
  const inFlight = useRef<Set<string>>(new Set())
  return useCallback(
    (artifactId: string) => {
      if (!artifactId) return
      const key = `SuikouWeb.Stores.ReviewStore|${artifactId}`
      if (prefetched.has(key) || inFlight.current.has(key)) return
      inFlight.current.add(key)
      connection
        .mountStore({
          module: "SuikouWeb.Stores.ReviewStore",
          id: artifactId,
          params: { artifact_id: artifactId },
          cache: storeCache
        })
        .then(async (mounted) => {
          await mounted.revalidated.catch(() => undefined)
          await mounted.unmount()
          prefetched.add(key)
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight.current.delete(key)
        })
    },
    [connection]
  )
}
