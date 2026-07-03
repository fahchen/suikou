import { observer } from "mobx-react-lite"

import { useSocketConnected } from "../musubi"
import { FileIcon } from "./FileIcon"

/** Persistent bottom bar (`.statusbar` in the mockup): current file · view label ·
 * round in the left cluster, connection state with a green LED on the right.
 * Kept slim (29px) so it reads as chrome, not content. When the viewed round is
 * the initial Round 0 with nothing submitted yet, a muted `draft` chip trails
 * the round label (A2 in the state catalog); when the review has a settled
 * outcome (all files approved, or any file at request_changes) a colored word
 * trails it (A8/A9). */
export type ReviewOutcome = "approved" | "changes_requested"

export const StatusBar = observer(function StatusBar(props: {
  path: string
  viewLabel: string
  round: number
  roundStatus?: "draft" | "superseded" | null
  outcome?: ReviewOutcome | null
  driftedAnchors?: number
}) {
  const { path, viewLabel, round, roundStatus, outcome, driftedAnchors = 0 } = props
  const connected = useSocketConnected()
  const parts = path.split("/")
  const name = parts[parts.length - 1]

  return (
    <footer
      className="relative z-10 flex h-[29px] shrink-0 items-center gap-[8px] border-t border-line-strong bg-panel px-[10px] text-[11.5px] text-muted-foreground shadow-[inset_0_1px_0_var(--line-soft)] sm:gap-[10px] sm:px-[14px]"
      role="contentinfo"
    >
      <span className="inline-flex min-w-0 items-center gap-[6px] text-text">
        <FileIcon name={name} />
        <b className="min-w-0 truncate font-[680] tabular-nums text-heading">{name}</b>
      </span>
      <Dot />
      <span className="shrink-0">{viewLabel}</span>
      <Dot />
      <span className="shrink-0">Round {round}</span>
      {roundStatus === "draft" ? (
        <>
          <Dot />
          <span className="shrink-0 text-faint">draft</span>
        </>
      ) : roundStatus === "superseded" ? (
        <>
          <Dot />
          <span className="shrink-0 text-faint">superseded &middot; read-only</span>
        </>
      ) : null}
      {outcome ? (
        <>
          <Dot />
          <span
            className={`shrink-0 font-[620] ${
              outcome === "approved" ? "text-green" : "text-red"
            }`}
          >
            {outcome === "approved" ? "approved" : "changes requested"}
          </span>
        </>
      ) : null}
      {driftedAnchors > 0 ? (
        <>
          <Dot />
          <span className="shrink-0 font-[620] text-amber">
            {driftedAnchors} drifted
          </span>
        </>
      ) : null}
      <span className="flex-1" />
      <span
        className={`inline-flex shrink-0 items-center gap-[5px] ${
          connected ? "" : "text-amber"
        }`}
      >
        <span
          className={`h-[7px] w-[7px] rounded-full ${
            connected
              ? "bg-green shadow-[0_0_6px_var(--color-green)] ring-2 ring-green/30"
              : "bg-amber shadow-[0_0_6px_var(--color-amber)] ring-2 ring-amber/30 animate-pulse"
          }`}
          aria-hidden
        />
        <span className="hidden sm:inline">
          {connected ? "connected" : "reconnecting"}
        </span>
      </span>
    </footer>
  )
})

function Dot() {
  return <span className="h-[2.5px] w-[2.5px] rounded-full bg-faint" aria-hidden />
}
