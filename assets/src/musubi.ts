import { Socket } from "phoenix"
import { createMusubi } from "@musubi/react"

// In dev the Vite ws proxy mangles the Phoenix socket upgrade, so connect
// straight to the Phoenix endpoint (check_origin is disabled in dev). Derive
// the host from the page so remote clients (e.g. over Tailscale) reach the dev
// machine instead of resolving "localhost" to themselves.
const socketUrl = import.meta.env.DEV
  ? `ws://${window.location.hostname}:4000/socket`
  : "/socket"

export const socket = new Socket(socketUrl)

export const {
  MusubiProvider,
  useMusubiConnectionStatus,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand
} = createMusubi<Musubi.Stores>()
