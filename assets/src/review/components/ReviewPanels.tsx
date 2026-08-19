import { type ReactNode, useState } from "react"
import type { StoreProxy } from "@musubi/react"
import {
  AlertTriangle,
  FileText,
  MessageSquare,
  Send,
} from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { Button } from "../../components/ui/button"
import { Dialog, DialogTitle } from "../../components/ui/dialog"
import { CommentCountChips } from "./comments/CommentCounts"
import { Popover } from "../../components/ui/popover"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

export type Verdict = "approve" | "request_changes" | "comment"
export type ReviewSummary = {
  perFile: {
    path: string
    draftVerdict: Verdict | null
    latestVerdict: Verdict | null
    approved: boolean
    openBlockers: number
    pending: number
    unresolved: number
  }[]
  verdict: Verdict | null
  defaultVerdict: Verdict
  reviewed: number
  draftVerdicts: number
  pendingComments: number
  blockerCount: number
  allApproved: boolean
  unresolved: number
  hasUnpublished: boolean
  waiting: number
}

export const VERDICT_META: Record<Verdict, { label: string; short: string }> = {
  approve: { label: "Approve", short: "Approved" },
  request_changes: { label: "Request changes", short: "Request changes" },
  comment: { label: "Comment", short: "Comment" },
}

const SUBMIT_ROWS: { verdict: Verdict; hint: string }[] = [
  { verdict: "request_changes", hint: "" },
  { verdict: "comment", hint: "no verdict" },
  { verdict: "approve", hint: "all files" },
]

const SUBMIT_BTN =
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-ctrl bg-accent px-3 text-xs font-semibold text-on-accent hover:brightness-[1.06] active:translate-y-px"

export function SubmitButton({
  store,
  review,
  onSelectFile,
}: {
  store: ReviewStore
  review: ReviewSummary
  onSelectFile: (path: string) => void
}) {
  const submit = useMusubiCommand(store, "submit_review")
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [chosen, setChosen] = useState<Verdict>(review.defaultVerdict)

  const openPanel = (set: (open: boolean) => void) => (open: boolean) => {
    if (open) setChosen(review.defaultVerdict)
    set(open)
  }

  const openFile = (path: string) => {
    setPopoverOpen(false)
    setSheetOpen(false)
    onSelectFile(path)
  }

  const run = () => {
    void submit.dispatch({ verdict: chosen }).finally(() => {
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
              Submit
              <Send size={14} aria-hidden />
            </button>
          }
        >
          <SubmitPanel
            review={review}
            heading
            onSelectFile={openFile}
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
        Submit
        <Send size={14} aria-hidden />
      </button>
      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} className="max-h-[86vh] sm:max-w-[360px]">
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <Send size={16} className="text-muted" aria-hidden />
          <DialogTitle className="text-sm font-bold text-ink">Finish review</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-auto p-2">
          <SubmitPanel
            review={review}
            onSelectFile={openFile}
            chosen={chosen}
            onChoose={setChosen}
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
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

export function verdictText(verdict: Verdict): string {
  return verdict === "request_changes" ? "text-request" : verdict === "approve" ? "text-approve" : "text-accent-bright"
}

function SubmitPanel({
  review,
  heading = false,
  onSelectFile,
  chosen,
  onChoose,
  submitting,
  onSubmit,
}: {
  review: ReviewSummary
  heading?: boolean
  onSelectFile: (path: string) => void
  chosen: Verdict
  onChoose: (verdict: Verdict) => void
  submitting: boolean
  onSubmit: () => void
}) {
  const softGate = chosen === "approve" && review.blockerCount > 0
  const filesWithComments = review.perFile.filter((f) => f.unresolved > 0 || f.pending > 0)
  const hasContent = review.hasUnpublished || review.pendingComments > 0 || review.draftVerdicts > 0
  const canSubmit = chosen === "approve" || hasContent

  return (
    <>
      {heading && (
        <div className="px-[9px] pt-2 pb-[7px] text-2xs font-bold uppercase tracking-[0.06em] text-faint">
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
              className={`flex items-center gap-2.5 rounded-ctrl px-[9px] py-2 text-left text-sm ${on ? "bg-soft" : "hover:bg-soft/60"}`}
            >
              <VerdictRadio verdict={verdict} on={on} />
              <span className={`font-medium ${on ? verdictText(verdict) : "text-ink"}`}>
                {VERDICT_META[verdict].label}
              </span>
              {hint && <span className="ml-auto text-xs text-faint">{hint}</span>}
            </button>
          )
        })}
      </div>
      <div className="my-1.5 h-px bg-hair-strong" />
      <div className="flex flex-col gap-1.5 px-[9px] py-1 text-xs text-text">
        <SummaryRow icon={MessageSquare} n={review.pendingComments} label="pending comments" />
        <SummaryRow icon={FileText} n={review.draftVerdicts} label="draft verdicts" />
      </div>
      {softGate && (
        <div className="mx-1 mt-1.5 mb-[9px] flex items-start gap-2 rounded-ctrl border border-amber-edge bg-amber-soft px-[11px] py-2.5 text-xs leading-[1.45] text-amber-deep">
          <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            <b className="font-bold">{review.blockerCount} open fix_required.</b> Approving anyway is
            allowed, you have the final call.
          </span>
        </div>
      )}
      {filesWithComments.length > 0 && (
        <div className="px-1 pb-1.5">
          <p className="mb-1.5 px-[5px] text-2xs font-bold uppercase tracking-[0.05em] text-faint">Files with comments</p>
          <FileCommentList perFile={filesWithComments} onSelectFile={onSelectFile} />
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
          className="inline-flex h-[35px] items-center justify-center rounded-ctrl bg-accent text-sm font-semibold text-on-accent hover:brightness-[1.06] disabled:opacity-50"
        >
          {canSubmit ? "Submit review" : "Nothing to submit"}
        </button>
      </div>
    </>
  )
}

/** Files that still carry comments, rolled up the way the status bar reads them
 * (`N open`, `M blockers`), so the submit panel never lists comment by comment. */
function FileCommentList({
  perFile,
  onSelectFile,
}: {
  perFile: ReviewSummary["perFile"]
  onSelectFile: (path: string) => void
}) {
  return (
    <div className="flex max-h-[168px] flex-col gap-1 overflow-auto">
      {perFile.map((file) => (
        <Button
          key={file.path}
          variant="ghost"
          size="sm"
          onClick={() => onSelectFile(file.path)}
          className="w-full justify-start gap-2 bg-soft px-2.5 font-normal hover:bg-control"
          title={`Open ${file.path}`}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
            {file.path.slice(file.path.lastIndexOf("/") + 1)}
          </span>
          <CommentCountChips
            counts={{ open: file.unresolved, blockers: file.openBlockers, pending: file.pending }}
          />
        </Button>
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
          <Send size={16} className={verdictText(verdict)} aria-hidden />
        </span>
        <DialogTitle className="text-sm font-bold text-ink">
          Submit this review as <span className={verdictText(verdict)}>{VERDICT_META[verdict].label}</span>?
        </DialogTitle>
      </div>
      <div className="flex flex-col gap-2 text-xs text-text">
        <ConfirmLine icon={MessageSquare}>
          Publishes <b className="font-bold text-ink">{review.pendingComments}</b> pending comments across all files
        </ConfirmLine>
        <ConfirmLine icon={FileText}>
          Records <b className="font-bold text-ink">{review.draftVerdicts}</b> draft file verdicts
        </ConfirmLine>
        {review.blockerCount > 0 && (
          <ConfirmLine icon={AlertTriangle}>
            <b className="font-bold text-ink">{review.blockerCount} open fix_required</b> stays open for the agent
          </ConfirmLine>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-sm font-medium text-muted hover:bg-soft"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
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

function verdictSoft(verdict: Verdict): string {
  return verdict === "request_changes"
    ? "bg-request-soft"
    : verdict === "approve"
      ? "bg-approve-soft"
      : "bg-accent-soft"
}
