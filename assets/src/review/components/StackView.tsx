import { observer } from "mobx-react-lite"
import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Layers, MessageSquareOff } from "lucide-react"

import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible"
import { Segmented } from "../../components/ui/segmented"
import { Toggle } from "../../components/ui/toggle"
import type { StackProgress } from "../../stores/stack-progress"
import type { ReviewView, StackStep } from "../../stores/ui-store"
import { NoticeBand } from "./EditorSurface"
import { FileRow, type ReviewFileEntry, type ReviewFileStatus } from "./FileNavigator"
import type { ScopeCommit } from "./ScopePicker"

/** Restacked review (BDR-0028) chrome: the Source | Stack switch, the step
 * rail, and the current step's header with its step bar. Steps are oldest
 * first and 1-based; `all` is the whole stack. */
export type StackCommit = ScopeCommit

/** The step `delta` away from `step`, walking steps 1..count then `all`;
 * `null` past either end. Prev/Next and `[` / `]` all walk this order. */
export function adjacentStep(step: StackStep, count: number, delta: 1 | -1): StackStep | null {
  const order: StackStep[] = [...Array.from({ length: count }, (_, i) => i + 1), "all"]
  return order[order.indexOf(step) + delta] ?? null
}

const shortSha = (sha: string): string => sha.slice(0, 7)

function CommitSubject({ subject }: { subject: string }) {
  return <>{subject}</>
}

/** `Source | Stack`: which way to read a stacked review. */
export function ViewSwitch({ view, onChange }: { view: ReviewView; onChange: (view: ReviewView) => void }) {
  return (
    <Segmented<ReviewView>
      value={view}
      onChange={onChange}
      options={[
        ["source", "Source"],
        ["stack", "Stack"],
      ]}
    />
  )
}

/** Whether the stack still carries exactly the source change. */
export function StackSyncBadge({ valid, inSync }: { valid: boolean | null; inSync: boolean | null }) {
  if (valid === false) return <Badge variant="warning">Missing</Badge>
  if (inSync === false) return <Badge variant="warning">Out of sync</Badge>
  return (
    <Badge variant="muted">
      <Check aria-hidden />
      In sync
    </Badge>
  )
}

/** Every step in order with its read mark; the current step opens onto its
 * files. `All changes` closes the list. */
export const StepRail = observer(function StepRail({
  steps,
  step,
  progress,
  entries,
  selectedPath,
  status,
  onStep,
  onSelectFile,
}: {
  steps: StackCommit[]
  step: StackStep
  progress: StackProgress
  /** The current step's files. */
  entries: ReviewFileEntry[]
  selectedPath: string | null
  status: Map<string, ReviewFileStatus>
  onStep: (step: StackStep) => void
  onSelectFile: (path: string) => void
}) {
  const readCount = steps.filter((commit) => progress.isRead(commit.sha)).length
  const files = (
    <div className="flex flex-col gap-0.5 pt-0.5 pb-1.5">
      {entries.map((entry) => (
        <FileRow
          key={entry.path}
          entry={entry}
          depth={2}
          isDiff
          selected={entry.path === selectedPath}
          onSelect={onSelectFile}
          live={status.get(entry.path)}
        />
      ))}
    </div>
  )

  return (
    <nav aria-label="Stack steps" className="flex min-h-0 flex-1 flex-col overflow-auto px-1.5 pb-2">
      <div className="flex items-center gap-[7px] px-1.5 pb-1.5">
        <Layers size={15} className="text-muted" aria-hidden />
        <h3 className="text-xs font-bold tracking-[-0.01em] text-ink">Steps</h3>
        <span className="flex-1" />
        <span className="text-xs font-semibold text-muted tabular-nums">
          {readCount}/{steps.length} read
        </span>
      </div>
      <ol className="flex flex-col gap-0.5">
        {steps.map((commit, index) => {
          const number = index + 1
          const current = step === number
          const read = progress.isRead(commit.sha)
          return (
            <li key={commit.sha}>
              <div
                className={`flex min-h-[34px] items-center gap-1 rounded-ctrl pr-1 coarse:min-h-[44px] ${
                  current ? "bg-soft" : "hover:bg-soft/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onStep(number)}
                  aria-current={current ? "step" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch pl-2 text-left"
                >
                  <span
                    className={`w-[18px] shrink-0 text-right font-mono text-2xs font-bold tabular-nums ${
                      current ? "text-accent-bright" : "text-faint"
                    }`}
                  >
                    {number}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      current ? "font-semibold text-ink" : read ? "text-muted" : "text-text"
                    }`}
                    title={commit.subject}
                  >
                    {commit.subject}
                  </span>
                </button>
                <ReadToggle read={read} number={number} onToggle={() => progress.toggle(commit.sha)} />
              </div>
              {current && files}
            </li>
          )
        })}
      </ol>
      <div className="mt-1.5 border-t border-hair pt-1.5">
        <button
          type="button"
          onClick={() => onStep("all")}
          aria-current={step === "all" ? "step" : undefined}
          className={`flex min-h-[34px] w-full items-center gap-2 rounded-ctrl px-2 text-left text-xs coarse:min-h-[44px] ${
            step === "all" ? "bg-soft font-semibold text-ink" : "text-text hover:bg-soft/60"
          }`}
        >
          <span className="min-w-0 flex-1 truncate">All changes</span>
        </button>
        {step === "all" && files}
      </div>
    </nav>
  )
})

function ReadToggle({
  read,
  number,
  size = "icon-sm",
  onToggle,
}: {
  read: boolean
  number: number
  size?: "icon-sm" | "touch"
  onToggle: () => void
}) {
  return (
    <Toggle
      variant="mark"
      size={size}
      pressed={read}
      onPressedChange={onToggle}
      aria-label={read ? `Mark step ${number} unread` : `Mark step ${number} read`}
      title={read ? "Read. Click to mark unread" : "Mark read"}
    >
      <span
        className={`grid size-[16px] place-items-center rounded-full border ${
          read ? "border-approve bg-approve text-on-accent" : "border-hair-strong"
        }`}
        aria-hidden
      >
        {read && <Check size={11} strokeWidth={3} />}
      </span>
    </Toggle>
  )
}

/** The current step above its diff: the step bar, then the full commit
 * message. The first `previewLines` of the body show, the rest fold behind
 * `more`; with `previewLines = 0` (phones) the whole body folds. The header
 * sits above the content's scroll, so the bar stays in reach. */
export const StepHeader = observer(function StepHeader({
  steps,
  step,
  stackRef,
  progress,
  onStep,
  onOpenSteps,
  touch = false,
  previewLines = 4,
}: {
  steps: StackCommit[]
  step: StackStep
  stackRef: string
  progress: StackProgress
  onStep: (step: StackStep) => void
  onOpenSteps?: () => void
  touch?: boolean
  previewLines?: number
}) {
  const commit = step === "all" ? null : (steps[step - 1] ?? null)
  return (
    <header className={`shrink-0 border-b border-hair ${touch ? "px-1 pb-1" : "px-2 pt-1.5 pb-2"}`}>
      <StepBar
        steps={steps}
        step={step}
        stackRef={stackRef}
        progress={progress}
        onStep={onStep}
        onOpenSteps={onOpenSteps}
        touch={touch}
      />
      {commit && (
        <div className={touch ? "px-3" : "px-[38px]"}>
          <StepMessage key={commit.sha} body={commit.body} previewLines={previewLines} />
        </div>
      )}
    </header>
  )
})

/** `◂ N/M <subject> ✓ ▸`, one bar at every width: Prev, the step (its
 * subject opens the steps where the rail is hidden), the read toggle, Next.
 * `touch` sizes every control for a thumb. */
const StepBar = observer(function StepBar({
  steps,
  step,
  stackRef,
  progress,
  onStep,
  onOpenSteps,
  touch,
}: {
  steps: StackCommit[]
  step: StackStep
  stackRef: string
  progress: StackProgress
  onStep: (step: StackStep) => void
  onOpenSteps?: () => void
  touch: boolean
}) {
  const commit = step === "all" ? null : (steps[step - 1] ?? null)
  const previous = adjacentStep(step, steps.length, -1)
  const next = adjacentStep(step, steps.length, 1)
  const position = step === "all" ? "All" : `${step}/${steps.length}`
  const navSize = touch ? "icon-touch" : "icon-sm"
  const identity = (
    <>
      <span className="shrink-0 font-mono text-2xs font-bold text-faint tabular-nums">{position}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-ink">
        {commit ? <CommitSubject subject={commit.subject} /> : "All changes"}
      </span>
      {!touch && (
        <span className="shrink-0 font-mono text-2xs text-faint">{commit ? shortSha(commit.sha) : stackRef}</span>
      )}
    </>
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        size={navSize}
        disabled={previous === null}
        onClick={() => previous !== null && onStep(previous)}
        aria-label="Previous step"
        title="Previous step ( [ )"
      >
        <ChevronLeft size={touch ? 20 : 15} aria-hidden />
      </Button>
      {onOpenSteps ? (
        <button
          type="button"
          onClick={onOpenSteps}
          aria-label={`Open steps, current ${step === "all" ? "all changes" : `step ${position}`}`}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-ctrl px-1.5 text-left hover:bg-soft ${
            touch ? "h-[44px]" : "h-[30px]"
          }`}
        >
          {identity}
          <ChevronDown size={12} className="shrink-0 text-muted" aria-hidden />
        </button>
      ) : (
        <h2 className="flex h-[30px] min-w-0 flex-1 items-center gap-2 px-1.5">{identity}</h2>
      )}
      {commit && step !== "all" && (
        <ReadToggle
          size={touch ? "touch" : "icon-sm"}
          read={progress.isRead(commit.sha)}
          number={step}
          onToggle={() => progress.toggle(commit.sha)}
        />
      )}
      <Button
        size={navSize}
        disabled={next === null}
        onClick={() => next !== null && onStep(next)}
        aria-label="Next step"
        title="Next step ( ] )"
      >
        <ChevronRight size={touch ? 20 : 15} aria-hidden />
      </Button>
    </div>
  )
})

const MESSAGE_BODY_CLASS = "max-w-[72ch] font-sans text-xs leading-[1.5] whitespace-pre-wrap text-muted"

/** The commit body: the first `previewLines`, the whole of it once opened.
 * Shown as one block either way, so a paragraph break at the fold survives. */
function StepMessage({ body, previewLines }: { body: string; previewLines: number }) {
  const [open, setOpen] = useState(false)
  if (!body) return null
  const lines = body.split("\n")
  const preview = lines.slice(0, previewLines).join("\n").trimEnd()
  const folds = lines.length > previewLines
  const bodyClass = MESSAGE_BODY_CLASS
  if (!folds) return <p className={`mt-1 ${bodyClass}`}>{body}</p>
  const shown = open ? body : preview
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
      {shown && <p className={`max-h-[40vh] overflow-auto ${bodyClass}`}>{shown}</p>}
      <CollapsibleTrigger className="mt-0.5 text-2xs font-semibold text-muted hover:text-ink">
        {preview ? (open ? "less" : "more") : open ? "Hide message" : "Show message"}
      </CollapsibleTrigger>
    </Collapsible>
  )
}

/** The stack has drifted from its source: new source commits are not on the
 * stack yet. A warning, never a block — the steps stay readable and
 * commentable. `compact` (phones) folds the explanation into one line that
 * expands on tap. */
export function StackOutOfSyncBanner({
  headRef,
  stackRef,
  compact = false,
  onViewSource,
}: {
  headRef: string
  stackRef: string
  compact?: boolean
  onViewSource: () => void
}) {
  const message = (
    <>
      <span className="font-mono font-semibold">{headRef}</span> has changes not yet on the stack. Ask the agent to
      cherry-pick them onto <span className="font-mono font-semibold">{stackRef}</span>.
    </>
  )
  const viewSource = (
    <Button variant="outline" size="sm" onClick={onViewSource} className="shrink-0">
      View source
    </Button>
  )
  const frame = "shrink-0 border-b border-amber-edge bg-amber-soft px-4 text-xs leading-[1.45] text-ink"
  const icon = <AlertTriangle size={15} className="shrink-0 text-amber" aria-hidden />

  if (compact) {
    return (
      <Collapsible role="status" className={frame}>
        <CollapsibleTrigger className="group flex min-h-[36px] w-full items-center gap-2 text-left">
          {icon}
          <span className="min-w-0 flex-1 truncate font-semibold">Stack out of sync with its source</span>
          <ChevronDown
            size={14}
            className="shrink-0 text-muted transition-transform group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="pb-2">{message}</p>
          <div className="pb-2.5">{viewSource}</div>
        </CollapsibleContent>
      </Collapsible>
    )
  }
  return (
    <div role="status" className={`flex items-center gap-2.5 py-2 ${frame}`}>
      {icon}
      <p className="min-w-0 flex-1">{message}</p>
      {viewSource}
    </div>
  )
}

/** A file a step touches with no net change on the source branch (added by
 * one step, removed by a later one): it reads as usual but takes no comments,
 * since rounds snapshot the source diff and it is not in it. */
export function OutsideNetChangeNotice() {
  return <NoticeBand icon={MessageSquareOff}>Not in the branch's net change: nothing to comment on here.</NoticeBand>
}
