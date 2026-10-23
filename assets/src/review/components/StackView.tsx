import { observer } from "mobx-react-lite"
import { Check, ChevronLeft, ChevronRight, Layers } from "lucide-react"

import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible"
import { Segmented } from "../../components/ui/segmented"
import { Toggle } from "../../components/ui/toggle"
import type { StackProgress } from "../../stores/stack-progress"
import type { ReviewView, StackStep } from "../../stores/ui-store"
import { FileRow, type ReviewFileEntry, type ReviewFileStatus } from "./FileNavigator"
import type { ScopeCommit } from "./ScopePicker"

/** Restacked review (BDR-0028) chrome: the Source | Stack switch, the step
 * rail, and the current step's header and Prev/Next. Steps are oldest first
 * and 1-based; `all` is the whole stack. */
export type StackCommit = ScopeCommit

/** The step `delta` away from `step`, walking steps 1..count then `all`;
 * `null` past either end. Prev/Next and `[` / `]` all walk this order. */
export function adjacentStep(step: StackStep, count: number, delta: 1 | -1): StackStep | null {
  const order: StackStep[] = [...Array.from({ length: count }, (_, i) => i + 1), "all"]
  return order[order.indexOf(step) + delta] ?? null
}

const shortSha = (sha: string): string => sha.slice(0, 7)

function stepSubject(steps: StackCommit[], step: StackStep): string {
  return step === "all" ? "All changes" : (steps[step - 1]?.subject ?? "")
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
                className={`flex min-h-[34px] items-center gap-1 rounded-ctrl pr-1 ${
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
          className={`flex min-h-[34px] w-full items-center gap-2 rounded-ctrl px-2 text-left text-xs ${
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
      size={size}
      pressed={read}
      onPressedChange={onToggle}
      aria-label={read ? `Mark step ${number} unread` : `Mark step ${number} read`}
      title={read ? "Read — click to mark unread" : "Mark read"}
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

/** The current step's identity and full commit message above its diff: the
 * first `previewLines` of the body show, the rest fold behind `more`. */
export const StepHeader = observer(function StepHeader({
  steps,
  step,
  stackRef,
  progress,
  previewLines = 4,
}: {
  steps: StackCommit[]
  step: StackStep
  stackRef: string
  progress: StackProgress
  previewLines?: number
}) {
  if (step === "all") {
    return (
      <header className="shrink-0 border-b border-hair px-4 py-2.5">
        <div className="font-mono text-2xs text-faint">
          All changes · {steps.length} {steps.length === 1 ? "step" : "steps"}
        </div>
        <h2 className="mt-0.5 text-sm font-semibold text-ink">
          The whole stack, <span className="font-mono">{stackRef}</span>
        </h2>
      </header>
    )
  }
  const commit = steps[step - 1]
  if (!commit) return null
  const read = progress.isRead(commit.sha)
  return (
    <header className="shrink-0 border-b border-hair px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xs text-faint tabular-nums">
          Step {step}/{steps.length} · {shortSha(commit.sha)}
        </span>
        <span className="flex-1" />
        <Toggle size="sm" pressed={read} onPressedChange={() => progress.toggle(commit.sha)}>
          <Check size={13} aria-hidden />
          {read ? "Read" : "Mark read"}
        </Toggle>
      </div>
      <h2 className="text-sm font-semibold text-ink">{commit.subject}</h2>
      <StepMessage key={commit.sha} body={commit.body} previewLines={previewLines} />
    </header>
  )
})

function StepMessage({ body, previewLines }: { body: string; previewLines: number }) {
  if (!body) return null
  const lines = body.split("\n")
  const preview = lines.slice(0, previewLines).join("\n")
  const rest = lines.slice(previewLines).join("\n")
  const bodyClass = "font-sans text-xs leading-[1.5] whitespace-pre-wrap text-muted"
  if (!rest) return <p className={`mt-1 ${bodyClass}`}>{preview}</p>
  return (
    <Collapsible className="mt-1">
      {preview && <p className={bodyClass}>{preview}</p>}
      <CollapsibleContent className={`max-h-[40vh] overflow-auto ${bodyClass}`}>{rest}</CollapsibleContent>
      <CollapsibleTrigger className="group mt-0.5 text-2xs font-semibold text-muted hover:text-ink">
        <span className="group-data-[panel-open]:hidden">more</span>
        <span className="hidden group-data-[panel-open]:inline">less</span>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

/** Prev / Next at the foot of the step's content. */
export function StepFooter({
  steps,
  step,
  onStep,
}: {
  steps: StackCommit[]
  step: StackStep
  onStep: (step: StackStep) => void
}) {
  const previous = adjacentStep(step, steps.length, -1)
  const next = adjacentStep(step, steps.length, 1)
  return (
    <div className="flex h-[42px] shrink-0 items-center gap-2 border-t border-hair px-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={previous === null}
        onClick={() => previous !== null && onStep(previous)}
        className="min-w-0 max-w-[45%]"
        title="Previous step ( [ )"
      >
        <ChevronLeft size={14} aria-hidden />
        <span className="truncate">{previous === null ? "Prev" : stepSubject(steps, previous)}</span>
      </Button>
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        disabled={next === null}
        onClick={() => next !== null && onStep(next)}
        className="min-w-0 max-w-[45%]"
        title="Next step ( ] )"
      >
        <span className="truncate">{next === null ? "Next" : stepSubject(steps, next)}</span>
        <ChevronRight size={14} aria-hidden />
      </Button>
    </div>
  )
}
