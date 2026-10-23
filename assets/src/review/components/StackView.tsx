import { observer } from "mobx-react-lite"
import type { ReactNode } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Layers } from "lucide-react"

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

/** The current step's identity and full commit message above its diff: the
 * first `previewLines` of the body show, the rest fold behind `more`. With
 * `bar`, a step bar (Prev, the step, Next) leads instead of the plain step
 * line — the medium layout, whose rail hides in a drawer the bar opens.
 * `compact` (phones) folds the whole body under the subject, which expands it
 * on tap; the bottom bar carries the read toggle there. */
export const StepHeader = observer(function StepHeader({
  steps,
  step,
  stackRef,
  progress,
  previewLines = 4,
  bar,
  compact = false,
}: {
  steps: StackCommit[]
  step: StackStep
  stackRef: string
  progress: StackProgress
  previewLines?: number
  bar?: { onStep: (step: StackStep) => void; onOpenSteps: () => void }
  compact?: boolean
}) {
  const commit = step === "all" ? null : (steps[step - 1] ?? null)
  const read = commit ? progress.isRead(commit.sha) : false
  const markRead = commit && (
    <Toggle size="sm" pressed={read} onPressedChange={() => progress.toggle(commit.sha)}>
      <Check size={13} aria-hidden />
      {read ? "Read" : "Mark read"}
    </Toggle>
  )
  const stepLine =
    step === "all"
      ? `All changes · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`
      : commit && `Step ${step}/${steps.length} · ${shortSha(commit.sha)}`
  const title = commit ? (
    commit.subject
  ) : (
    <>
      The whole stack, <span className="font-mono">{stackRef}</span>
    </>
  )

  if (compact) {
    return (
      <header className="shrink-0 border-b border-hair px-4 py-2">
        <div className="font-mono text-2xs text-faint tabular-nums">{stepLine}</div>
        {commit?.body ? (
          <Collapsible key={commit.sha}>
            <CollapsibleTrigger className="group flex w-full items-start gap-1.5 text-left">
              <h2 className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</h2>
              <ChevronDown
                size={15}
                className="mt-0.5 shrink-0 text-muted transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className={`mt-1 max-h-[40vh] overflow-auto ${MESSAGE_BODY_CLASS}`}>
              {commit.body}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        )}
      </header>
    )
  }

  return (
    <header className="shrink-0 border-b border-hair px-4 py-2.5">
      {bar ? (
        <div className="-ml-2 flex items-center gap-2">
          <StepBar steps={steps} step={step} onStep={bar.onStep} onOpenSteps={bar.onOpenSteps} />
          <span className="flex-1" />
          {commit && <span className="font-mono text-2xs text-faint">{shortSha(commit.sha)}</span>}
          {markRead}
        </div>
      ) : (
        <>
          <div className="flex min-h-[26px] items-center gap-2">
            <span className="font-mono text-2xs text-faint tabular-nums">{stepLine}</span>
            <span className="flex-1" />
            {markRead}
          </div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </>
      )}
      {commit && <StepMessage key={commit.sha} body={commit.body} previewLines={previewLines} />}
    </header>
  )
})

/** `◂ N/M <subject> ▸`: steps back and forth; the subject opens the steps. A
 * `trailing` slot sits before Next (the phone bar's read toggle); `touch`
 * sizes every control for a thumb. */
export function StepBar({
  steps,
  step,
  onStep,
  onOpenSteps,
  trailing,
  touch = false,
}: {
  steps: StackCommit[]
  step: StackStep
  onStep: (step: StackStep) => void
  onOpenSteps: () => void
  trailing?: ReactNode
  touch?: boolean
}) {
  const previous = adjacentStep(step, steps.length, -1)
  const next = adjacentStep(step, steps.length, 1)
  const position = step === "all" ? "All" : `${step}/${steps.length}`
  const navSize = touch ? "icon-touch" : "icon-sm"
  return (
    <div className={`flex min-w-0 items-center ${touch ? "flex-1 gap-1" : "gap-0.5"}`}>
      <Button
        size={navSize}
        disabled={previous === null}
        onClick={() => previous !== null && onStep(previous)}
        aria-label="Previous step"
        title="Previous step ( [ )"
      >
        <ChevronLeft size={touch ? 20 : 15} aria-hidden />
      </Button>
      <button
        type="button"
        onClick={onOpenSteps}
        aria-label={`Open steps, current ${step === "all" ? "all changes" : `step ${position}`}`}
        className={`flex min-w-0 items-center gap-2 rounded-ctrl px-1.5 text-left hover:bg-soft ${
          touch ? "h-[44px] flex-1" : "h-[30px]"
        }`}
      >
        <span className="shrink-0 font-mono text-2xs font-bold text-faint tabular-nums">{position}</span>
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{stepSubject(steps, step)}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" aria-hidden />
      </button>
      {trailing}
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
}

const MESSAGE_BODY_CLASS = "max-w-[72ch] font-sans text-xs leading-[1.5] whitespace-pre-wrap text-muted"

function StepMessage({ body, previewLines }: { body: string; previewLines: number }) {
  if (!body) return null
  const lines = body.split("\n")
  const preview = lines.slice(0, previewLines).join("\n")
  const rest = lines.slice(previewLines).join("\n")
  const bodyClass = MESSAGE_BODY_CLASS
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

/** The phone's fixed bottom bar, in thumb reach: `◂ N/M <subject> ✓ ▸`. The
 * subject opens the steps sheet; ✓ toggles the step read. */
export const StepBottomBar = observer(function StepBottomBar({
  steps,
  step,
  progress,
  onStep,
  onOpenSteps,
}: {
  steps: StackCommit[]
  step: StackStep
  progress: StackProgress
  onStep: (step: StackStep) => void
  onOpenSteps: () => void
}) {
  const commit = step === "all" ? null : (steps[step - 1] ?? null)
  return (
    <div className="flex shrink-0 items-center border-t border-hair bg-surface px-1">
      <StepBar
        touch
        steps={steps}
        step={step}
        onStep={onStep}
        onOpenSteps={onOpenSteps}
        trailing={
          commit &&
          step !== "all" && (
            <ReadToggle
              size="touch"
              read={progress.isRead(commit.sha)}
              number={step}
              onToggle={() => progress.toggle(commit.sha)}
            />
          )
        }
      />
    </div>
  )
})

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
