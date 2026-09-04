import { type ReactNode, useState } from "react"
import type { StoreProxy } from "@musubi/react"
import {
  AlertTriangle,
  MessageSquare,
  Send,
} from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { Button } from "../../components/ui/button"
import { Dialog, DialogTitle } from "../../components/ui/dialog"
import { CommentCountChips } from "./comments/CommentCounts"
import { Popover } from "../../components/ui/popover"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

export type ReviewSummary = {
  perFile: {
    path: string
    openBlockers: number
    pending: number
    unresolved: number
  }[]
  pendingComments: number
  blockerCount: number
  unresolved: number
  hasUnpublished: boolean
  waiting: number
}

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

  const openFile = (path: string) => {
    setPopoverOpen(false)
    setSheetOpen(false)
    onSelectFile(path)
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
          onOpenChange={setPopoverOpen}
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
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
        </Popover>
      </div>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
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
            submitting={submit.isPending}
            onSubmit={() => setConfirm(true)}
          />
        </div>
      </Dialog>
      <SubmitConfirm
        open={confirm}
        review={review}
        pending={submit.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      />
    </>
  )
}

function SubmitPanel({
  review,
  heading = false,
  onSelectFile,
  submitting,
  onSubmit,
}: {
  review: ReviewSummary
  heading?: boolean
  onSelectFile: (path: string) => void
  submitting: boolean
  onSubmit: () => void
}) {
  const filesWithComments = review.perFile.filter((f) => f.unresolved > 0 || f.pending > 0)

  return (
    <>
      {heading && (
        <div className="px-[9px] pt-2 pb-[7px] text-2xs font-bold uppercase tracking-[0.06em] text-faint">
          Finish review
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-[9px] py-1 text-xs text-text">
        <SummaryRow icon={MessageSquare} n={review.pendingComments} label="pending comments" />
      </div>
      {filesWithComments.length > 0 && (
        <div className="px-1 pb-1.5">
          <p className="mb-1.5 px-[5px] text-2xs font-bold uppercase tracking-[0.05em] text-faint">Files with comments</p>
          <FileCommentList perFile={filesWithComments} onSelectFile={onSelectFile} />
        </div>
      )}
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="inline-flex h-[35px] items-center justify-center rounded-ctrl bg-accent text-sm font-semibold text-on-accent hover:brightness-[1.06] disabled:opacity-50"
        >
          Submit review
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
    <div className="flex max-h-[176px] flex-col overflow-auto rounded-ctrl border border-hair-strong bg-soft/50">
      {perFile.map((file) => {
        const cut = file.path.lastIndexOf("/") + 1
        return (
          <Button
            key={file.path}
            variant="ghost"
            size="sm"
            onClick={() => onSelectFile(file.path)}
            className="h-auto w-full justify-between gap-2 rounded-none px-2.5 py-1.5 text-left font-normal not-last:border-b not-last:border-hair"
            title={`Open ${file.path}`}
          >
            {/* Basename only: the popover is too narrow for a path, and truncation
                would eat the end that identifies the file. Hover shows the path. */}
            <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-ink">{file.path.slice(cut)}</span>
            <CommentCountChips
              counts={{ open: file.unresolved, blockers: file.openBlockers, pending: file.pending }}
            />
          </Button>
        )
      })}
    </div>
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
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  review: ReviewSummary
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} className="gap-3 p-5 sm:max-w-[380px]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft">
          <Send size={16} className="text-accent-bright" aria-hidden />
        </span>
        <DialogTitle className="text-sm font-bold text-ink">Submit this review?</DialogTitle>
      </div>
      <div className="flex flex-col gap-2 text-xs text-text">
        <ConfirmLine icon={MessageSquare}>
          Publishes <b className="font-bold text-ink">{review.pendingComments}</b> pending comments across all files
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
