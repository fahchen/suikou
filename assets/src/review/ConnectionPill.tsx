import { useEffect, useState } from "react"

import { useSocketConnected } from "../musubi"
import { Badge } from "@/components/ui/badge"

// The socket flaps on every micro-reconnect; only surface a drop once it has
// lasted long enough to be worth a human's attention.
const GRACE_MS = 600

/**
 * Top-bar connection indicator. Invisible while connected; after a brief grace
 * delay shows a muted pulsing "Reconnecting" pill so a user whose socket dropped
 * (e.g. a backgrounded mobile tab) understands why command buttons are disabled.
 */
export function ConnectionPill() {
  const connected = useSocketConnected()
  const [showDrop, setShowDrop] = useState(false)

  useEffect(() => {
    if (connected) {
      setShowDrop(false)
      return
    }
    const timer = setTimeout(() => setShowDrop(true), GRACE_MS)
    return () => clearTimeout(timer)
  }, [connected])

  if (connected || !showDrop) return null

  return (
    <Badge variant="muted">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      Reconnecting
    </Badge>
  )
}
