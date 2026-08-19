import { cloneElement, useState } from "react"
import type { ReactElement } from "react"
import { Check, MessageSquare } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion"
import { Badge } from "../../components/ui/badge"
import { Dialog, DialogTitle } from "../../components/ui/dialog"
import { Popover } from "../../components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { CommentCountChips, countComments } from "./comments/CommentCounts"
import { TYPE_META, type Comment } from "./comments/shared"

export type CommentFile = { path: string; comments: Comment[] }

/** Every comment in the review, split into the open file and the whole review
 * (grouped by file, collapsed). Rendered as a popover on desktop and a sheet on
 * phones; picking a row jumps to that comment. */
export function CommentsOverview({
  files,
  total,
  currentPath,
  desktop,
  trigger,
  onOpenComment,
}: {
  files: CommentFile[]
  total: number
  currentPath: string | null
  desktop: boolean
  trigger: ReactElement<{ onClick?: () => void }>
  onOpenComment: (path: string, comment: Comment) => void
}) {
  const [open, setOpen] = useState(false)
  const jump = (path: string, comment: Comment) => {
    setOpen(false)
    onOpenComment(path, comment)
  }
  const current = files.find((f) => f.path === currentPath) ?? null
  const body = (
    <Tabs defaultValue="file" className="min-h-0 flex-1">
      <TabsList>
        <TabsTrigger value="file">
          This file
          <Badge>{current?.comments.length ?? 0}</Badge>
        </TabsTrigger>
        <TabsTrigger value="all">
          All files
          <Badge>{total}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="file" className="overflow-auto p-1.5">
        {current && current.comments.length > 0 ? (
          <Rows comments={current.comments} onPick={(c) => jump(current.path, c)} />
        ) : (
          <Empty text="No comments on this file" />
        )}
      </TabsContent>
      <TabsContent value="all" className="overflow-auto p-1.5">
        {files.length > 0 ? (
          <Accordion>
            {files.map((file) => (
              <AccordionItem key={file.path} value={file.path}>
                <AccordionTrigger>
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted" title={file.path}>
                    {file.path}
                  </span>
                  <CommentCountChips counts={countComments(file.comments)} />
                </AccordionTrigger>
                <AccordionContent>
                  <Rows comments={file.comments} onPick={(c) => jump(file.path, c)} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Empty text="No comments in this review" />
        )}
      </TabsContent>
    </Tabs>
  )

  if (!desktop) {
    return (
      <>
        {cloneElement(trigger, { onClick: () => setOpen(true) })}
        <Dialog open={open} onClose={() => setOpen(false)} className="max-h-[82vh] sm:max-w-[460px]">
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <MessageSquare size={16} className="text-muted" aria-hidden />
            <DialogTitle className="text-base font-bold text-ink">Comments</DialogTitle>
          </div>
          {body}
        </Dialog>
      </>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      className="flex max-h-[70vh] w-[400px] flex-col p-0"
      render={trigger}
    >
      {body}
    </Popover>
  )
}

function Rows({ comments, onPick }: { comments: Comment[]; onPick: (comment: Comment) => void }) {
  return (
    <div className="flex flex-col">
      {comments.map((comment) => (
        <Row key={comment.id} comment={comment} onPick={() => onPick(comment)} />
      ))}
    </div>
  )
}

function Row({ comment, onPick }: { comment: Comment; onPick: () => void }) {
  const meta = TYPE_META[comment.critique_type as keyof typeof TYPE_META] ?? TYPE_META.note
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const label = comment.scope === "artifact" ? "File" : anchor ? `L${anchor.start_line}` : "Anchor"
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-start gap-2 rounded-ctrl px-1.5 py-1.5 text-left hover:bg-soft"
    >
      <meta.Icon size={13} className={`mt-0.5 shrink-0 ${comment.resolved ? "text-faint" : "text-muted"}`} aria-hidden />
      <span className="shrink-0 font-mono text-2xs text-faint tabular-nums">{label}</span>
      {/* ponytail: first line of the raw markdown, no rendering — the row is a jump target, not a reader. */}
      <span className={`min-w-0 flex-1 truncate text-xs ${comment.resolved ? "text-muted line-through" : "text-text"}`}>
        {comment.body.split("\n").find((line) => line.trim()) ?? ""}
      </span>
      {comment.status === "pending" && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber" title="Unpublished" aria-hidden />}
      {comment.resolved && <Check size={12} className="mt-0.5 shrink-0 text-approve" aria-hidden />}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-8 text-center text-xs text-muted">{text}</div>
}
