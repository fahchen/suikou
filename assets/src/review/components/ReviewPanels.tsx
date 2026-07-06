import { type ReactNode, useState } from "react"
import type { StoreProxy } from "@musubi/react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  ListTree,
  MessageSquare,
  Upload,
  X,
} from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { Dialog, DialogTitle } from "../../components/ui/dialog"
import { Popover } from "../../components/ui/popover"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

export type Verdict = "approve" | "request_changes" | "comment"
export type Blocker = { path: string; line: number | null }
export type ReviewSummary = {
  perFile: { draftVerdict: Verdict | null; latestVerdict: Verdict | null; approved: boolean }[]
  verdict: Verdict | null
  reviewed: number
  draftVerdicts: number
  pendingComments: number
  blockers: Blocker[]
  allApproved: boolean
  unresolved: number
  hasUnpublished: boolean
}

export const VERDICT_META: Record<Verdict, { label: string; short: string }> = {
  approve: { label: "Approve", short: "Approved" },
  request_changes: { label: "Request changes", short: "Request changes" },
  comment: { label: "Comment", short: "Comment" },
}

const SUBMIT_ROWS: { verdict: Verdict; hint: string }[] = [
  { verdict: "comment", hint: "no verdict" },
  { verdict: "approve", hint: "all files" },
  { verdict: "request_changes", hint: "" },
]

const SUBMIT_BTN =
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl bg-accent px-3 text-[12.5px] font-semibold text-on-accent hover:brightness-[1.06] active:translate-y-px"

export function SubmitButton({ store, review }: { store: ReviewStore; review: ReviewSummary }) {
  const submit = useMusubiCommand(store, "submit_review")
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [chosen, setChosen] = useState<Verdict>("comment")

  const openPanel = (set: (open: boolean) => void) => (open: boolean) => {
    if (open) setChosen(review.verdict ?? "comment")
    set(open)
  }

  const run = () => {
    void submit.dispatch({}).finally(() => {
      setConfirm(false)
      setPopoverOpen(false)
      setSheetOpen(false)
    })
  }

  return (
    <>
      <div className="hidden lg:block">
        <Popover
          open={popoverOpen}
          onOpenChange={openPanel(setPopoverOpen)}
          className="w-[290px] p-[7px]"
          render={
            <button type="button" className={SUBMIT_BTN}>
              <Upload size={14} aria-hidden />
              Submit
              <ChevronDown size={12} className="opacity-80" aria-hidden />
            </button>
          }
        >
          <SubmitPanel
            review={review}
            heading
            chosen={chosen}
            onChoose={setChosen}
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
        </Popover>
      </div>
      <button
        type="button"
        onClick={() => openPanel(setSheetOpen)(true)}
        className={`lg:hidden ${SUBMIT_BTN}`}
      >
        <Upload size={14} aria-hidden />
        Submit
        <ChevronDown size={12} className="opacity-80" aria-hidden />
      </button>
      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} className="max-h-[86vh] sm:max-w-[360px]">
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <Upload size={16} className="text-muted" aria-hidden />
          <DialogTitle className="text-[14px] font-bold text-ink">Finish review</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-auto p-2">
          <SubmitPanel
            review={review}
            chosen={chosen}
            onChoose={setChosen}
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
          {review.blockers.length > 0 && (
            <div className="px-1">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">Open blockers</p>
              <BlockerList blockers={review.blockers} />
            </div>
          )}
        </div>
      </Dialog>
      <SubmitConfirm
        open={confirm}
        review={review}
        verdict={chosen}
        pending={submit.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      />
    </>
  )
}

export function ReviewButton({ review }: { review: ReviewSummary }) {
  return (
    <Popover
      align="end"
      className="w-[290px] p-3"
      render={
        <button
          type="button"
          title="Review summary"
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-2.5 text-[12.5px] font-medium text-ink hover:bg-soft"
        >
          <ListTree size={14} className="text-muted" aria-hidden />
          Review
          <ChevronDown size={12} className="text-faint" aria-hidden />
        </button>
      }
    >
      <ReviewOverview review={review} />
    </Popover>
  )
}

export function verdictText(verdict: Verdict): string {
  return verdict === "request_changes" ? "text-request" : verdict === "approve" ? "text-approve" : "text-accent-bright"
}

function SubmitPanel({
  review,
  heading = false,
  chosen,
  onChoose,
  submitting,
  onSubmit,
}: {
  review: ReviewSummary
  heading?: boolean
  chosen: Verdict
  onChoose: (verdict: Verdict) => void
  submitting: boolean
  onSubmit: () => void
}) {
  const softGate = chosen === "approve" && review.blockers.length > 0
  const hasContent = review.hasUnpublished || review.pendingComments > 0 || review.draftVerdicts > 0
  const canSubmit = chosen === "approve" || hasContent

  return (
    <>
      {heading && (
        <div className="px-[9px] pt-2 pb-[7px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
          Finish review
        </div>
      )}
      <div className="flex flex-col">
        {SUBMIT_ROWS.map(({ verdict, hint }) => {
          const on = chosen === verdict
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => onChoose(verdict)}
              className={`flex items-center gap-2.5 rounded-ctrl px-[9px] py-2 text-left text-[13px] ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <VerdictRadio verdict={verdict} on={on} />
              <span className={`font-medium ${on ? verdictText(verdict) : "text-ink"}`}>
                {VERDICT_META[verdict].label}
              </span>
              {hint && <span className="ml-auto text-[11px] text-faint">{hint}</span>}
            </button>
          )
        })}
      </div>
      <div className="my-1.5 h-px bg-hair-strong" />
      <div className="flex flex-col gap-1.5 px-[9px] py-1 text-[12px] text-text">
        <SummaryRow icon={MessageSquare} n={review.pendingComments} label="pending comments" />
        <SummaryRow icon={FileText} n={review.draftVerdicts} label="draft verdicts" />
      </div>
      {softGate && (
        <div className="mx-1 mt-1.5 mb-[9px] flex items-start gap-2 rounded-ctrl border border-amber-edge bg-amber-soft px-[11px] py-2.5 text-[11.5px] leading-[1.45] text-amber-deep">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            <b className="font-bold">{review.blockers.length} open fix_required.</b> Approving anyway is
            allowed, you have the final call.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
          className="inline-flex h-[35px] items-center justify-center rounded-ctrl bg-accent text-[13px] font-semibold text-on-accent hover:brightness-[1.06] disabled:opacity-50"
        >
          {canSubmit ? "Submit review" : "Nothing to submit"}
        </button>
      </div>
    </>
  )
}

function BlockerList({ blockers }: { blockers: Blocker[] }) {
  return (
    <div className="flex flex-col gap-1">
      {blockers.map((blocker, index) => (
        <div
          key={`${blocker.path}:${blocker.line}:${index}`}
          className="flex items-center gap-2 rounded-[7px] border border-request-edge bg-request-soft px-2.5 py-1.5"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-request shadow-[0_0_6px_var(--request)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">
            {blocker.path.slice(blocker.path.lastIndexOf("/") + 1)}
          </span>
          {blocker.line !== null && <span className="shrink-0 font-mono text-[11px] text-muted">line {blocker.line}</span>}
        </div>
      ))}
    </div>
  )
}

function VerdictRadio({ verdict, on }: { verdict: Verdict; on: boolean }) {
  const ring = verdict === "request_changes" ? "border-request" : verdict === "approve" ? "border-approve" : "border-accent"
  const dot = verdict === "request_changes" ? "bg-request" : verdict === "approve" ? "bg-approve" : "bg-accent"

  return (
    <span
      className={`grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] ${on ? ring : "border-hair-strong"}`}
    >
      {on && <span className={`size-2 rounded-full ${dot}`} />}
    </span>
  )
}

function SummaryRow({ icon: Icon, n, label }: { icon: typeof MessageSquare; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="text-muted" aria-hidden />
      <span>
        <b className="font-bold text-ink tabular-nums">{n}</b> {label}
      </span>
    </div>
  )
}

function SubmitConfirm({
  open,
  review,
  verdict,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  review: ReviewSummary
  verdict: Verdict
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} className="gap-3 p-5 sm:max-w-[380px]">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-[30px] shrink-0 place-items-center rounded-[9px] ${verdictSoft(verdict)}`}>
          <Upload size={16} className={verdictText(verdict)} aria-hidden />
        </span>
        <DialogTitle className="text-[13.5px] font-bold text-ink">
          Submit this review as <span className={verdictText(verdict)}>{VERDICT_META[verdict].label}</span>?
        </DialogTitle>
      </div>
      <div className="flex flex-col gap-2 text-[12px] text-text">
        <ConfirmLine icon={MessageSquare}>
          Publishes <b className="font-bold text-ink">{review.pendingComments}</b> pending comments across all files
        </ConfirmLine>
        <ConfirmLine icon={FileText}>
          Records <b className="font-bold text-ink">{review.draftVerdicts}</b> draft file verdicts
        </ConfirmLine>
        {review.blockers.length > 0 && (
          <ConfirmLine icon={AlertTriangle}>
            <b className="font-bold text-ink">{review.blockers.length} open fix_required</b> stays open for the agent
          </ConfirmLine>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-[13px] font-medium text-muted hover:bg-soft"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
        >
          Submit review
        </button>
      </div>
    </Dialog>
  )
}

function ConfirmLine({ icon: Icon, children }: { icon: typeof MessageSquare; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-px shrink-0 text-muted" aria-hidden />
      <span className="leading-[1.45]">{children}</span>
    </div>
  )
}

function ReviewOverview({ review }: { review: ReviewSummary }) {
  const total = review.perFile.length

  return (
    <div className="flex flex-col gap-3">
      <VerdictSummary verdict={review.verdict} allApproved={review.allApproved} />
      <div>
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">Open blockers</p>
        {review.blockers.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] border border-approve-edge bg-approve-soft py-2 text-[12px] font-medium text-approve">
            <Check size={14} aria-hidden />
            No open blockers
          </div>
        ) : (
          <BlockerList blockers={review.blockers} />
        )}
      </div>
      <div>
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">This round</p>
        <div className="grid grid-cols-3 gap-[7px]">
          <IoStat n={total} label="files" />
          <IoStat n={review.unresolved} label="unresolved" tone={review.unresolved > 0 ? "warn" : undefined} />
          <IoStat n={review.reviewed} label="reviewed" tone={review.reviewed === total && total > 0 ? "ok" : undefined} />
        </div>
      </div>
    </div>
  )
}

function VerdictSummary({ verdict, allApproved }: { verdict: Verdict | null; allApproved: boolean }) {
  if (allApproved) {
    return (
      <div className="flex items-center gap-2.5 rounded-[9px] bg-approve-soft px-[11px] py-2.5 shadow-[inset_0_0_0_0.5px_var(--approve-edge)]">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-approve-soft">
          <Check size={15} className="text-approve" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Verdict</span>
          <span className="text-[13px] font-semibold text-approve">Review approved</span>
        </span>
      </div>
    )
  }

  const bad = verdict === "request_changes"
  const tint = bad
    ? "bg-request-soft shadow-[inset_0_0_0_0.5px_var(--request-edge)]"
    : verdict === "approve"
      ? "bg-approve-soft shadow-[inset_0_0_0_0.5px_var(--approve-edge)]"
      : "bg-soft shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"

  return (
    <div className={`flex items-center gap-2.5 rounded-[9px] px-[11px] py-2.5 ${tint}`}>
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-canvas/40">
        {bad ? (
          <X size={15} className="text-request" aria-hidden />
        ) : verdict === "approve" ? (
          <Check size={15} className="text-approve" aria-hidden />
        ) : (
          <MessageSquare size={15} className="text-accent-bright" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Draft verdict</span>
        <span className={`text-[13px] font-semibold ${verdict ? verdictText(verdict) : "text-muted"}`}>
          {verdict ? `${VERDICT_META[verdict].label} (draft)` : "No verdict yet"}
        </span>
      </span>
    </div>
  )
}

function IoStat({ n, label, tone }: { n: number; label: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-approve" : tone === "warn" ? "text-request" : "text-ink"

  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-hair-strong bg-canvas py-2">
      <span className={`text-[18px] font-bold tabular-nums ${color}`}>{n}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.02em] text-muted">{label}</span>
    </div>
  )
}

function verdictSoft(verdict: Verdict): string {
  return verdict === "request_changes"
    ? "bg-request-soft"
    : verdict === "approve"
      ? "bg-approve-soft"
      : "bg-accent-soft"
}
