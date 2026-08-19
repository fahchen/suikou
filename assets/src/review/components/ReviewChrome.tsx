import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import type { StoreProxy } from "@musubi/react"
import { Check, ChevronDown, ChevronLeft, Circle, GitCompare, MessageSquare, RotateCcw, SlidersHorizontal, X } from "lucide-react"

import { toast } from "sonner"

import { writeClipboard } from "../../lib/clipboard"
import { useMusubiCommand } from "../../musubi"
import { uiStore } from "../../stores/ui-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Button } from "../../components/ui/button"
import { Popover } from "../../components/ui/popover"
import { CommentsOverview, type CommentFile } from "./CommentsOverview"
import type { Comment } from "./comments/shared"
import { SubmitButton, type ReviewSummary, VERDICT_META, verdictText, type Verdict } from "./ReviewPanels"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>

type PerFile = {
  draftVerdict: Verdict | null
  latestVerdict: Verdict | null
  approved: boolean
}

type RoundSummary = { number: number; comment_count: number; unresolved_count: number }

const VERDICT_CHIP: Record<
  Verdict,
  { icon: typeof Check; className: string }
> = {
  approve: { icon: Check, className: "bg-approve-soft text-approve shadow-[inset_0_0_0_0.5px_var(--approve-edge)]" },
  request_changes: { icon: X, className: "bg-request-soft text-request shadow-[inset_0_0_0_0.5px_var(--request-edge)]" },
  comment: { icon: MessageSquare, className: "bg-soft text-text shadow-[inset_0_0_0_0.5px_var(--hair-strong)]" },
}

export function Toolbar({
  name,
  connected,
  store,
  review,
  roundSummaries,
  selectedRound,
  latestRound,
  onSelectFile,
}: {
  name: string
  connected: boolean
  store: ReviewStore
  review: ReviewSummary
  roundSummaries: RoundSummary[]
  selectedRound: number
  latestRound: number
  onSelectFile: (path: string) => void
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-[9px] px-2 lg:h-[50px] lg:px-3">
      <Link
        to="/"
        className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl px-1 hover:bg-soft lg:px-2"
        title={connected ? "Back to projects" : "Reconnecting…"}
        aria-label="Back to projects"
      >
        <ChevronLeft size={20} className={`text-muted ${connected ? "" : "animate-pulse"}`} aria-hidden />
      </Link>
      <div className="flex min-w-0 flex-1 items-center px-1 lg:h-[30px]">
        <span className="truncate text-sm font-semibold tracking-[-0.015em] text-ink lg:text-sm">{name}</span>
      </div>
      {roundSummaries.length > 0 && (
        <RoundSelector
          store={store}
          rounds={roundSummaries}
          selectedRound={selectedRound}
          latestRound={latestRound}
        />
      )}
      <button
        onClick={() => uiStore.setSettingsOpen(true)}
        className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        title="Settings"
      >
        <SlidersHorizontal size={16} aria-hidden />
      </button>
      <SubmitButton store={store} review={review} onSelectFile={onSelectFile} />
    </div>
  )
}

export function VerdictChip({ file, proxy }: { file: PerFile; proxy: FileStoreProxy }) {
  const setVerdict = useMusubiCommand(proxy, "set_draft_verdict")
  const dismiss = useMusubiCommand(proxy, "dismiss_approval")
  const [open, setOpen] = useState(false)
  const effective = file.draftVerdict ?? file.latestVerdict
  const chip = effective ? VERDICT_CHIP[effective] : null
  const Icon = chip?.icon ?? Circle

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-[220px] p-2"
      render={
        <button
          type="button"
          title={`Per-file verdict${effective ? `: ${VERDICT_META[effective].label}` : ""}`}
          className={`inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-semibold sm:px-2.5 ${
            chip ? chip.className : "border border-dashed border-hair-strong bg-soft/50 text-muted"
          }`}
        >
          <Icon size={13} aria-hidden />
          <span className="hidden sm:inline">{effective ? VERDICT_META[effective].label : "No verdict"}</span>
          {file.draftVerdict !== null && (
            <span className="size-1.5 rounded-full bg-amber" title="Unsubmitted draft" aria-hidden />
          )}
          <ChevronDown size={11} className="opacity-70" aria-hidden />
        </button>
      }
    >
      <div className="px-1 pt-1 pb-1.5 text-2xs font-bold uppercase tracking-[0.06em] text-faint">
        File verdict
      </div>
      <div className="flex flex-col">
        {(["approve", "request_changes", "comment"] as Verdict[]).map((verdict) => {
          const meta = VERDICT_CHIP[verdict]
          const on = effective === verdict
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => void setVerdict.dispatch({ verdict })}
              className={`flex items-center gap-2.5 rounded-ctrl px-2 py-1.5 text-left text-sm ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <meta.icon size={14} className={verdictText(verdict)} aria-hidden />
              <span className={`font-medium ${on ? verdictText(verdict) : "text-ink"}`}>{VERDICT_META[verdict].label}</span>
              <span className={`ml-auto size-1.5 shrink-0 rounded-full bg-accent ${on ? "" : "opacity-0"}`} aria-hidden />
            </button>
          )
        })}
      </div>
      {file.approved && (
        <>
          <div className="my-1.5 h-px bg-hair-strong" />
          <button
            type="button"
            onClick={() => void dismiss.dispatch({})}
            className="flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-left text-xs text-text hover:bg-soft"
          >
            <RotateCcw size={13} className="text-muted" aria-hidden />
            Dismiss approval
          </button>
        </>
      )}
    </Popover>
  )
}

export function StatusBar({
  path,
  connected,
  review,
  round,
  readOnly,
  stacked = false,
  commentFiles,
  commentTotal,
  desktop,
  onOpenComment,
}: {
  path: string | null
  connected: boolean
  review: ReviewSummary
  round: number
  readOnly: boolean
  stacked?: boolean
  commentFiles: CommentFile[]
  commentTotal: number
  desktop: boolean
  onOpenComment: (path: string, comment: Comment) => void
}) {
  const total = review.perFile.length
  const blockers = review.blockerCount
  const waiting = useStickyWaiting(review.waiting)

  return (
    <div className="flex h-[29px] shrink-0 items-center gap-2 overflow-hidden px-3.5 text-xs text-muted [box-sizing:content-box]">
      {path ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyPath(path)}
          title={`Copy ${path}`}
          className="min-w-[3.5rem] flex-1 justify-start truncate px-1 font-mono font-normal text-faint"
        >
          <span className="truncate">{path}</span>
        </Button>
      ) : (
        <span className="min-w-[3.5rem] flex-1 truncate font-mono text-faint">No file selected</span>
      )}
      {stacked && (
        <>
          <StatusDot />
          <span className="shrink-0 font-medium text-muted">stacked</span>
        </>
      )}
      <StatusDot />
      <span className="shrink-0 tabular-nums">
        <span className="hidden sm:inline">Round {round}</span>
        <span className="sm:hidden">R{round}</span>
      </span>
      {readOnly && <span className="font-semibold text-muted">· read-only</span>}
      <StatusDot />
      <span className="shrink-0 tabular-nums">
        {review.reviewed}/{total}
        <span className="hidden md:inline"> reviewed</span>
      </span>
      <StatusDot />
      <CommentsOverview
        files={commentFiles}
        total={commentTotal}
        currentPath={path}
        desktop={desktop}
        onOpenComment={onOpenComment}
        trigger={
          <Button variant="ghost" size="sm" title="Browse comments" className="px-1.5 font-normal">
            <MessageSquare size={12} aria-hidden />
            {/* Only the counts that differ: a total equal to the open count, or
                a blocker count equal to it, says the same thing twice. */}
            {review.unresolved < commentTotal && <span className="tabular-nums">{commentTotal}</span>}
            {review.unresolved > 0 && (
              <span className="font-semibold text-request tabular-nums">
                {review.unresolved} open
                {blockers > 0 && blockers < review.unresolved && (
                  <>
                    <span className="hidden sm:inline">
                      , {blockers} blocker{blockers === 1 ? "" : "s"}
                    </span>
                    <span className="sm:hidden">/{blockers} blk</span>
                  </>
                )}
              </span>
            )}
          </Button>
        }
      />
      {waiting > 0 ? (
        <span className="inline-flex shrink-0 animate-pulse items-center gap-1.5 font-medium text-accent">
          <span
            className="size-[7px] rounded-full bg-accent shadow-[0_0_0_2.5px_var(--accent-soft)]"
            aria-hidden
          />
          <span className="tabular-nums">{waiting}</span>
          <span className="hidden sm:inline">waiting</span>
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <span
            className={`size-[7px] rounded-full ${connected ? "bg-approve shadow-[0_0_0_2.5px_var(--approve-soft)]" : "bg-amber shadow-[0_0_0_2.5px_var(--amber-soft)]"}`}
            aria-hidden
          />
          <span className="hidden sm:inline">{connected ? "connected" : "reconnecting…"}</span>
        </span>
      )}
    </div>
  )
}

// Keeps the "waiting" indicator lit for a short grace period after the count
// drops to zero, so the sub-second gap between one `wait` call timing out and
// the launcher re-issuing the next one does not blink the badge every cycle.
function useStickyWaiting(count: number): number {
  const [display, setDisplay] = useState(count)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (count > 0) {
      setDisplay(count)
    } else {
      timer.current = setTimeout(() => setDisplay(0), 3000)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [count])

  return display
}

function copyPath(path: string) {
  void writeClipboard(path).then((ok) => (ok ? toast.success("Path copied", { description: path }) : toast.error("Copy failed")))
}

function StatusDot() {
  return <span className="size-[2.5px] shrink-0 rounded-full bg-faint" aria-hidden />
}

function RoundSelector({
  store,
  rounds,
  selectedRound,
  latestRound,
}: {
  store: ReviewStore
  rounds: RoundSummary[]
  selectedRound: number
  latestRound: number
}) {
  const select = useMusubiCommand(store, "select_round")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={`Round ${selectedRound}${selectedRound < latestRound ? " (read-only)" : ""}`}
            className={`h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-hair-strong bg-canvas px-2 text-xs font-medium text-ink hover:bg-soft sm:inline-flex sm:gap-1.5 sm:rounded-ctrl sm:px-2.5 ${latestRound > 1 ? "inline-flex" : "hidden"}`}
          >
            <GitCompare size={14} className="hidden text-muted sm:block" aria-hidden />
            <span className="hidden sm:inline">Round </span>
            <span className="sm:hidden">R</span>
            {selectedRound}
            {selectedRound < latestRound && (
              <span className="hidden text-xs font-semibold text-muted sm:inline">· read-only</span>
            )}
            <ChevronDown size={12} className="text-faint" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {[...rounds]
          .sort((a, b) => b.number - a.number)
          .map((round) => (
            <DropdownMenuItem
              key={round.number}
              selected={round.number === selectedRound}
              onClick={() => void select.dispatch({ number: round.number })}
            >
              <span className={`flex-1 font-medium ${round.number === selectedRound ? "text-accent-bright" : "text-ink"}`}>
                Round {round.number}
                {round.number === latestRound && <span className="ml-1.5 text-xs font-normal text-muted">latest</span>}
              </span>
              {round.unresolved_count > 0 && (
                <span className="shrink-0 text-xs font-semibold text-request tabular-nums">{round.unresolved_count} open</span>
              )}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

