import { useEffect, useState } from "react"

import { PaneHead, Row } from "./pane-parts"
import * as push from "../../lib/push"
import { Switch } from "../../components/ui/switch"

const NOTIF_HINT: Record<"unsupported" | "denied", string> = {
  unsupported:
    "Needs a secure context. Over the tailnet, front the app with HTTPS (tailscale serve); plain HTTP and the dev server carry no push.",
  denied: "Blocked. Allow notifications for this site in your browser settings, then reload.",
}

export function NotificationsPane() {
  const [reason, setReason] = useState(push.unavailableReason())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    push.isSubscribed().then((subscribed) => {
      if (active) setEnabled(subscribed)
    })
    return () => {
      active = false
    }
  }, [])

  const onChange = async (next: boolean) => {
    setBusy(true)
    try {
      if (next) {
        setEnabled(await push.enable())
      } else {
        await push.disable()
        setEnabled(false)
      }
    } finally {
      setReason(push.unavailableReason())
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PaneHead
        title="Notifications"
        lede="Let an agent ping you to come review. Opt in per device — the subscription lives in this browser."
      />
      <Row
        title="Review notifications"
        sub={
          reason
            ? NOTIF_HINT[reason]
            : "Show a system notification when an agent asks you to review a change."
        }
      >
        <Switch
          aria-label="Review notifications"
          checked={enabled}
          disabled={reason !== null || busy}
          onCheckedChange={onChange}
        />
      </Row>
    </div>
  )
}
