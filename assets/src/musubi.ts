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
// bfcache — an open WebSocket makes a page bfcache-ineligible. The server stops
// a review's page store the moment its channel drops, so on resume the server
// store is gone. We don't reload to recover it: the file content is served from
// the HTTP/SWR cache and is already on screen — only the live Musubi store lost
// its channel. Reconnecting the socket is enough. `socket.connect()` fires the
// socket's `onOpen`, which drives musubi's `handleSocketReopen`: it re-joins the
// connection channel and remounts each live root on the fresh transport. The
// remount's mount push makes the server `start_fresh_root` (rebuilding the page
// store under the same deterministic root_id), and its initial patch is swapped
// atomically into the still-rendering last-good snapshot. No React remount, so
// scroll position is untouched. The catch phoenix gives us: a *clean* disconnect
// is not auto-reconnected, so nothing reopens the transport on its own — we must
// call `connect()` ourselves on resume.
// `pagehide`/`pageshow` (never `beforeunload`/`unload`, which disable bfcache).
if (typeof window !== "undefined") {
  let released = false
  window.addEventListener("pagehide", () => {
    released = true
    socket.disconnect()
  })
  // Clear the flag only once the transport is actually back, so a resume signal
  // that fires before the network is ready (e.g. `visibilitychange` while still
  // offline) keeps us armed and a later `online`/`pageshow` retries the connect.
  socket.onOpen(() => {
    released = false
  })
  const resume = () => {
    // Only after a real hide-release, and only if the socket is actually down
    // (a quick tab switch never released it). `connect()` is idempotent, but the
    // guard keeps us from fighting phoenix's own auto-reconnect on an abnormal
    // mid-session drop, which we never released.
    if (released && !socket.isConnected()) socket.connect()
  }
  window.addEventListener("pageshow", resume)
  // iOS Safari does not always fire `pageshow` on resume; `visibilitychange` to
  // visible is the reliable signal.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume()
  })
  window.addEventListener("online", resume)
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
  buster: "v3",
  // Effectively never expire; buster is the real invalidator. Max 32-bit
  // setTimeout delay (~24.8d) — Infinity coerces to 0 and would evict on unmount.
  gcTime: 2_147_483_647
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
