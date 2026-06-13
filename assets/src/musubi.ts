import { Socket } from "phoenix"
import { createStorageCachePersister } from "@musubi/client"
import { createMusubi } from "@musubi/react"

// In dev the Vite ws proxy mangles the Phoenix socket upgrade, so connect
// straight to the Phoenix endpoint (check_origin is disabled in dev). Derive
// the host from the page so remote clients (e.g. over Tailscale) reach the dev
// machine instead of resolving "localhost" to themselves.
const socketUrl = import.meta.env.DEV
  ? `ws://${window.location.hostname}:4000/socket`
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
  useMusubiConnectionStatus,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand
} = createMusubi<Musubi.Stores>()
