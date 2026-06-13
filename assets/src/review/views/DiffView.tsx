import { useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { AnimatePresence, motion } from "motion/react"
import { Plus, SquarePlus } from "lucide-react"

import type { Comment } from "../types"
import { CRITIQUE_META } from "../types"
import { CommentCard } from "../CommentCard"
import { useReviewCommands } from "../commands"
import {
  parseUnifiedDiff,
  quoteDiffSide,
  type DiffCell,
  type DiffHunk,
  type DiffRow,
  type DiffSide,
  type ParsedDiff
} from "../diff-parse"
import type { CritiqueType } from "../../stores/ui-store"
import { Button } from "@/components/ui/button"
import type { ViewProps } from "./registry"

interface Selection {
  side: DiffSide
  start: number
  end: number
}

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"]

const TYPE_TONE: Record<string, string> = {
  red: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
  amber: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/30",
  muted: "bg-soft text-heading ring-1 ring-inset ring-line"
}

// `green-soft` isn't a defined token; the green channel exists only as the solid
// `--green`, so adds use the same 15% opacity tint everywhere in the view.
const ROW_KIND_CLASS: Record<DiffRow["kind"], { old: string; new: string }> = {
  context: { old: "bg-editor", new: "bg-editor" },
  add: { old: "bg-editor", new: "bg-green/15" },
  remove: { old: "bg-red-soft", new: "bg-editor" },
  replace: { old: "bg-red-soft", new: "bg-green/15" }
}

const SIDE_LABEL: Record<DiffSide, string> = { old: "old", new: "new" }

export const DiffView = observer(function DiffView(props: ViewProps) {
  const { view, inline } = props
  const { content, contentError, loading, comments } = view
  const [selection, setSelection] = useState<Selection | null>(null)

  const parsed = useMemo<ParsedDiff>(() => parseUnifiedDiff(content), [content])

  if (contentError) return <Notice title="Can't load this diff" message={contentError} />
  if (loading && content === "") return <Notice title="Loading…" message="Fetching the diff." />
  if (parsed.hunks.length === 0)
    return (
      <Notice
        title="No changes"
        message="This file has no differences between the selected branches."
      />
    )

  const unanchored = comments.filter((c) => !c.anchor)

  function onGutterClick(side: DiffSide, lineNo: number, shift: boolean): void {
    if (selection && selection.side === side && shift) {
      setSelection({
        side,
        start: Math.min(selection.start, lineNo),
        end: Math.max(selection.end, lineNo)
      })
      return
    }
    setSelection({ side, start: lineNo, end: lineNo })
  }

  function closeComposer(): void {
    setSelection(null)
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-editor py-3 text-[13px] sm:py-4">
      {inline &&
        unanchored.map((comment) => (
          <div key={comment.id} className="px-4 pb-2">
            <CommentCard comment={comment} context="inline" />
          </div>
        ))}

      {parsed.hunks.map((hunk, i) => (
        <HunkBlock
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          parsed={parsed}
          comments={comments}
          inline={inline}
          selection={selection}
          onGutterClick={onGutterClick}
          closeComposer={closeComposer}
        />
      ))}
    </article>
  )
})

const HunkBlock = observer(function HunkBlock(props: {
  hunk: DiffHunk
  parsed: ParsedDiff
  comments: Comment[]
  inline: boolean
  selection: Selection | null
  onGutterClick: (side: DiffSide, lineNo: number, shift: boolean) => void
  closeComposer: () => void
}) {
  const { hunk, parsed, comments, inline, selection, onGutterClick, closeComposer } = props
  return (
    <section className="mt-3 first:mt-0">
      <header className="bg-soft px-3 py-1 font-mono text-[12px] text-muted-foreground">
        {hunk.header}
      </header>
      <div className="font-mono">
        {hunk.rows.map((row, i) => (
          <DiffRowView
            key={i}
            row={row}
            parsed={parsed}
            comments={comments}
            inline={inline}
            selection={selection}
            onGutterClick={onGutterClick}
            closeComposer={closeComposer}
          />
        ))}
      </div>
    </section>
  )
})

const DiffRowView = observer(function DiffRowView(props: {
  row: DiffRow
  parsed: ParsedDiff
  comments: Comment[]
  inline: boolean
  selection: Selection | null
  onGutterClick: (side: DiffSide, lineNo: number, shift: boolean) => void
  closeComposer: () => void
}) {
  const { row, parsed, comments, inline, selection, onGutterClick, closeComposer } = props
  const tone = ROW_KIND_CLASS[row.kind]
  const composerOpen =
    selection != null &&
    ((selection.side === "old" && row.old?.lineNo === selection.end) ||
      (selection.side === "new" && row.new?.lineNo === selection.end))

  return (
    <div>
      <div className="grid grid-cols-[3rem_1fr_3rem_1fr] items-stretch">
        <SideCell
          cell={row.old}
          side="old"
          tone={tone.old}
          selection={selection}
          onGutterClick={onGutterClick}
        />
        <SideCell
          cell={row.new}
          side="new"
          tone={tone.new}
          selection={selection}
          onGutterClick={onGutterClick}
        />
      </div>

      {composerOpen && selection != null && (
        <DiffComposer
          side={selection.side}
          startLine={selection.start}
          endLine={selection.end}
          parsed={parsed}
          onClose={closeComposer}
        />
      )}

      {inline && <AnchoredComments row={row} comments={comments} />}
    </div>
  )
})

function SideCell(props: {
  cell: DiffCell | null
  side: DiffSide
  tone: string
  selection: Selection | null
  onGutterClick: (side: DiffSide, lineNo: number, shift: boolean) => void
}) {
  const { cell, side, tone, selection, onGutterClick } = props
  const selected =
    cell != null &&
    selection != null &&
    selection.side === side &&
    cell.lineNo >= selection.start &&
    cell.lineNo <= selection.end
  const gutterTone = selected ? "bg-active-line text-blue" : `${tone} text-faint`
  const cellTone = selected ? "bg-active-line" : tone

  if (!cell) {
    return (
      <>
        <div className={`border-r border-line-soft ${tone}`} aria-hidden />
        <div className={tone} aria-hidden />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        title={`Add a comment on ${SIDE_LABEL[side]} line ${cell.lineNo} (Shift-click to extend)`}
        aria-label={`Add a comment on ${SIDE_LABEL[side]} line ${cell.lineNo}`}
        aria-selected={selected}
        className={`group flex items-center justify-end gap-1 border-r border-line-soft pr-2 text-right font-mono text-[12px] transition-colors hover:text-blue ${gutterTone}`}
        onClick={(e) => {
          const shift =
            e.shiftKey || (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches)
          onGutterClick(side, cell.lineNo, !!shift)
        }}
      >
        <Plus size={12} className="hidden text-blue group-hover:block" aria-hidden />
        {cell.lineNo}
      </button>
      <div className={`whitespace-pre pl-2 text-text ${cellTone}`}>
        {cell.text === "" ? " " : cell.text}
      </div>
    </>
  )
}

function AnchoredComments(props: { row: DiffRow; comments: Comment[] }) {
  const { row, comments } = props
  const matches = comments.filter((c) => {
    if (c.anchor?.type !== "diff_hunk") return false
    const cell = c.anchor.side === "old" ? row.old : row.new
    return cell != null && c.anchor.start_line === cell.lineNo
  })
  if (matches.length === 0) return null
  return (
    <AnimatePresence initial={false}>
      {matches.map((comment) => (
        <div key={comment.id} className="px-2 pt-2 pl-14 sm:px-4 sm:pl-16">
          <CommentCard comment={comment} context="inline" />
        </div>
      ))}
    </AnimatePresence>
  )
}

const DiffComposer = observer(function DiffComposer(props: {
  side: DiffSide
  startLine: number
  endLine: number
  parsed: ParsedDiff
  onClose: () => void
}) {
  const commands = useReviewCommands()
  const [body, setBody] = useState("")
  const [type, setType] = useState<CritiqueType>("note")

  const selectedText = useMemo(
    () => quoteDiffSide(props.parsed, props.side, props.startLine, props.endLine),
    [props.parsed, props.side, props.startLine, props.endLine]
  )

  function suggest(): void {
    const fence = `\`\`\`suggestion\n${selectedText}\n\`\`\``
    setBody((prev) => `${prev}${prev ? "\n" : ""}${fence}`)
  }

  function add(): void {
    if (!body.trim()) return
    void commands.addComment.dispatch({
      scope: "located",
      critique_type: type,
      body: body.trim(),
      anchor: {
        type: "diff_hunk",
        side: props.side,
        start_line: props.startLine,
        end_line: props.endLine
      }
    })
    props.onClose()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      add()
    } else if (e.key === "Escape") {
      e.preventDefault()
      props.onClose()
    }
  }

  const range =
    props.startLine === props.endLine
      ? `${SIDE_LABEL[props.side]} line ${props.startLine}`
      : `${SIDE_LABEL[props.side]} lines ${props.startLine}-${props.endLine}`

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="my-1 ml-14 mr-2 flex flex-col gap-2 overflow-hidden rounded-lg border border-blue-soft bg-surface p-3 shadow-[var(--surface-shadow)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-[12px] font-medium text-heading">New comment on {range}</span>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {TYPES.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={type === kind}
              className={`pointer-coarse:h-8 inline-flex h-6 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                type === kind
                  ? TYPE_TONE[CRITIQUE_META[kind].tone]
                  : "text-faint ring-1 ring-inset ring-line hover:bg-hover hover:text-muted-foreground"
              }`}
              onClick={() => setType(kind)}
            >
              {CRITIQUE_META[kind].label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        autoFocus
        className="min-h-20 w-full resize-y rounded-md border border-line bg-control px-2 py-1.5 text-[13px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
        placeholder="Leave a comment. Markdown supported."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground pointer-coarse:min-h-8"
          onClick={suggest}
          disabled={selectedText === ""}
        >
          <SquarePlus size={13} />
          Suggest
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:min-h-9"
            onClick={props.onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:min-h-9"
            disabled={commands.addComment.isPending || !body.trim()}
            onClick={add}
          >
            Add comment
          </Button>
        </div>
      </div>
    </motion.div>
  )
})

function Notice(props: { title: string; message: string }) {
  return (
    <article className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-editor px-6 py-16 text-center">
      <div className="text-sm font-medium text-heading">{props.title}</div>
      <p className="max-w-sm text-[13px] text-muted-foreground">{props.message}</p>
    </article>
  )
}
