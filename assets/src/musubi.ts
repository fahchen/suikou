import { useCallback, useRef, useSyncExternalStore } from "react"
import { Socket } from "phoenix"
import { createStorageCachePersister } from "@musubi/client"
import { createMusubi } from "@musubi/react"

// In dev the Vite ws proxy mangles the Phoenix socket upgrade, so connect
// straight to the Phoenix endpoint (check_origin is disabled in dev). Derive
// the host from the page so remote clients (e.g. over Tailscale) reach the dev
// machine instead of resolving "localhost" to themselves.
const socketUrl = import.meta.env.DEV
  ? `ws://${window.location.hostname}:4710/socket`
  : "/socket"

export const socket = new Socket(socketUrl)

// Free the socket while the page is frozen so Safari can keep the page in
// bfcache — an open WebSocket makes a page bfcache-ineligible, which on iOS
// forces a full reload on resume instead of an instant in-memory restore. On
// `pageshow` (including a bfcache restore, when no React effect re-runs)
// reconnect; musubi re-mounts its roots on socket reopen, and the SWR caches
// keep the last-good view painted meanwhile. Uses `pagehide`/`pageshow`, never
// `beforeunload`/`unload` — those listeners would themselves disable bfcache.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    socket.disconnect()
  })
  window.addEventListener("pageshow", () => {
    if (!socket.isConnected()) socket.connect()
  })
}

/**
 * Live WebSocket connectivity. `useMusubiConnectionStatus` only reports the
 * initial connect; it stays "ready" after a mid-session drop. The phoenix socket,
 * by contrast, fires open/close/error on every reconnect cycle, so subscribe to it
 * directly to know whether commands can currently reach the server.
 */
export function useSocketConnected(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const refs = [socket.onOpen(onChange), socket.onClose(onChange), socket.onError(onChange)]
      return () => socket.off(refs)
    },
    () => socket.isConnected()
  )
}

// Persist last-known store state across reloads so a route swap (or a fresh tab)
// paints from cache instead of flashing loading. `buster` is the data-shape
// version: bump it whenever a store's snapshot shape changes so deployed clients
// discard stale entries.
export const storeCache = {
  persister: createStorageCachePersister(localStorage),
  buster: "v3"
}

export const {
  MusubiProvider,
  useMusubiConnection,
  useMusubiConnectionStatus,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand
} = createMusubi<Musubi.Stores>()

// One prefetch per reviewId per page session — hover handlers fire many times;
// dedupe so we mount/unmount the server-side root at most once.
const prefetched = new Set<string>()

/**
 * Returns a hover-friendly prefetcher for a ReviewStore identity keyed by
 * reviewId. Warms the SWR cache so the first visit to a review paints from
 * cache instead of waiting on the initial patch.
 */
export function usePrefetchReviewStore(): (reviewId: string) => void {
  const connection = useMusubiConnection()
  const inFlight = useRef<Set<string>>(new Set())
  return useCallback(
    (reviewId: string) => {
      if (!reviewId) return
      const key = `SuikouWeb.Stores.ReviewStore|${reviewId}`
      if (prefetched.has(key) || inFlight.current.has(key)) return
      inFlight.current.add(key)
      connection
        .mountStore({
          module: "SuikouWeb.Stores.ReviewStore",
          id: reviewId,
          params: { review_id: reviewId },
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
