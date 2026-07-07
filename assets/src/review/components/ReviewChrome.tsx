import { useState } from "react"
import type { StoreProxy } from "@musubi/react"
import { Check, ChevronDown, Circle, GitCompare, GitCompareArrows, MessageSquare, RotateCcw, SlidersHorizontal, X } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { uiStore, type CommentDisplayMode } from "../../stores/ui-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Popover } from "../../components/ui/popover"
import { ReviewButton, SubmitButton, type ReviewSummary, VERDICT_META, verdictText, type Verdict } from "./ReviewPanels"

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
  isDiff,
  connected,
  store,
  review,
  roundSummaries,
  selectedRound,
  latestRound,
  canCompare,
  compareOpen,
  onToggleCompare,
}: {
  name: string
  isDiff: boolean
  connected: boolean
  store: ReviewStore
  review: ReviewSummary
  roundSummaries: RoundSummary[]
  selectedRound: number
  latestRound: number
  canCompare: boolean
  compareOpen: boolean
  onToggleCompare: () => void
}) {
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-[9px] border-b border-hair-strong bg-surface px-3">
      <a
        href="/"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-ctrl px-2 hover:bg-soft"
        title={connected ? "Back to projects" : "Reconnecting…"}
      >
        <span
          className={`grid size-6 place-items-center rounded-[7px] bg-accent text-[13px] font-black text-on-accent ${
            connected ? "" : "animate-pulse"
          }`}
        >
          S
        </span>
      </a>
      <div className="inline-flex h-[30px] min-w-0 items-center gap-2 px-1">
        <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink">{name}</span>
        {isDiff && (
          <span className="ml-1 inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-2 pl-1.5 text-[11px] font-semibold text-accent-bright">
            <GitCompare size={12} aria-hidden />
            Diff
          </span>
        )}
      </div>
      <span className="flex-1" />
      <span className="hidden sm:inline-flex">
        <ReviewButton review={review} />
      </span>
      {canCompare && (
        <button
          type="button"
          onClick={onToggleCompare}
          title="Compare with the previous round"
          className={`hidden h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctrl border px-2.5 text-[12.5px] font-medium sm:inline-flex ${
            compareOpen
              ? "border-accent-edge bg-accent-soft text-accent-bright"
              : "border-hair-strong bg-canvas text-ink hover:bg-soft"
          }`}
        >
          <GitCompareArrows size={14} className={compareOpen ? "text-accent-bright" : "text-muted"} aria-hidden />
          Compare
        </button>
      )}
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
      <SubmitButton store={store} review={review} />
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
          className={`inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold sm:px-2.5 ${
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
      <div className="px-1 pt-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
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
              className={`flex items-center gap-2.5 rounded-ctrl px-2 py-1.5 text-left text-[13px] ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <meta.icon size={14} className={verdictText(verdict)} aria-hidden />
              <span className={`font-medium ${on ? verdictText(verdict) : "text-ink"}`}>{VERDICT_META[verdict].label}</span>
              {on && <Check size={13} className="ml-auto text-approve" aria-hidden />}
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
            className="flex w-full items-center gap-2 rounded-ctrl px-2 py-1.5 text-left text-[12.5px] text-text hover:bg-soft"
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
  blockers,
  round,
  readOnly,
  commentDisplay,
}: {
  path: string | null
  connected: boolean
  blockers: number
  round: number
  readOnly: boolean
  commentDisplay: CommentDisplayMode
}) {
  return (
    <div className="flex h-[29px] shrink-0 items-center gap-2.5 border-t border-hair-strong bg-surface px-3.5 text-[11.5px] text-muted">
      <span className="truncate font-mono text-faint">{path ?? "No file selected"}</span>
      <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
      <span>Round {round}</span>
      {readOnly && <span className="font-semibold text-muted">· read-only</span>}
      {commentDisplay !== "inline" && (
        <>
          <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
          <span>{commentDisplay === "side" ? "side rail" : "comments hidden"}</span>
        </>
      )}
      {blockers > 0 && (
        <>
          <span className="size-[2.5px] rounded-full bg-faint" aria-hidden />
          <span className="font-semibold text-request">{blockers} unresolved</span>
        </>
      )}
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`size-[7px] rounded-full ${connected ? "bg-approve shadow-[0_0_0_2.5px_var(--approve-soft)]" : "bg-amber shadow-[0_0_0_2.5px_var(--amber-soft)]"}`}
          aria-hidden
        />
        {connected ? "connected" : "reconnecting…"}
      </span>
    </div>
  )
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
            className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctrl border border-hair-strong bg-canvas px-2 text-[12.5px] font-medium text-ink hover:bg-soft sm:px-2.5"
          >
            <GitCompare size={14} className="text-muted" aria-hidden />
            <span className="hidden sm:inline">Round </span>
            <span className="sm:hidden">R</span>
            {selectedRound}
            {selectedRound < latestRound && (
              <span className="hidden text-[11px] font-semibold text-muted sm:inline">· read-only</span>
            )}
            <ChevronDown size={12} className="text-faint" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {[...rounds]
          .sort((a, b) => b.number - a.number)
          .map((round) => (
            <DropdownMenuItem key={round.number} onClick={() => void select.dispatch({ number: round.number })}>
              <span className={`flex-1 font-medium ${round.number === selectedRound ? "text-accent-bright" : "text-ink"}`}>
                Round {round.number}
                {round.number === latestRound && <span className="ml-1.5 text-[11px] font-normal text-muted">latest</span>}
              </span>
              {round.unresolved_count > 0 && (
                <span className="text-[11px] font-semibold text-request tabular-nums">{round.unresolved_count} open</span>
              )}
              {round.number === selectedRound && <Check size={13} className="ml-1.5 text-approve" aria-hidden />}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
