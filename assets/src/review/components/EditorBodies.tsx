import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"
import type { ThemedToken } from "shiki"
import { Plus } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { uiStore, type MonoSize } from "../../stores/ui-store"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { Popover } from "../../components/ui/popover"
import { renderMarkdownBlocks } from "../markdown"
import type { Comment, CommentsStoreProxy, CritiqueType } from "./comments/shared"
import { Composer } from "./comments/Composer"
import { CommentThread } from "./comments/CommentThread"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type Range = { start: number; end: number }
type HighlightRange = Range | null
type ComposerMode = "inline" | "popover"

const MONO_PX: Record<MonoSize, string> = { small: "11.5px", default: "12.5px", large: "14px" }

export const MarkdownPreview = observer(function MarkdownPreview({
  source,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  readOnly = false,
  showThreads = true,
  composerMode = "inline",
  focusedCommentId = null,
  highlightedRange = null,
  onFocusComment,
}: {
  source: string
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
  readOnly?: boolean
  showThreads?: boolean
  composerMode?: ComposerMode
  focusedCommentId?: string | null
  highlightedRange?: HighlightRange
  onFocusComment?: (commentId: string | null) => void
}) {
  const blocks = useMemo(() => renderMarkdownBlocks(source), [source])
  const gutter = String(blocks.length ? blocks[blocks.length - 1].endLine : 1).length
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  const threadsByBlock = useMemo(() => {
    const map = new Map<number, Comment[]>()
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const start = comment.anchor.start_line
      let idx = blocks.findIndex((block) => start >= block.line && start <= block.endLine)
      if (idx === -1) {
        idx = 0
        for (let i = 0; i < blocks.length; i += 1) if (blocks[i].line <= start) idx = i
      }
      const bucket = map.get(idx)
      if (bucket) bucket.push(comment)
      else map.set(idx, [comment])
    }
    return map
  }, [comments, blocks])

  const [draft, setDraft] = useState<Range | null>(null)
  const [switchTo, setSwitchTo] = useState<Range | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const draftRef = useRef<Range | null>(draft)
  draftRef.current = draft
  const dragRef = useRef(drag)
  dragRef.current = drag
  const openKey = `suikou-composer:${draftScope}`

  const open = (range: Range) => {
    setDraft(range)
    localStorage.setItem(openKey, JSON.stringify(range))
  }
  const close = () => {
    const current = draftRef.current
    if (current) localStorage.removeItem(draftBodyKey(draftScope, current))
    localStorage.removeItem(openKey)
    setDraft(null)
  }
  const requestOpen = (range: Range) => {
    if (readOnly) return
    const current = draftRef.current
    if (current && !sameRange(current, range) && hasDraftBody(draftScope, current)) setSwitchTo(range)
    else open(range)
  }

  useEffect(() => {
    const raw = localStorage.getItem(openKey)
    const stored = raw ? safeRange(raw) : null
    const locatable = stored !== null && blocks.some((block) => block.endLine === stored.end && block.line >= stored.start)
    const restored = stored && locatable && hasDraftBody(draftScope, stored) ? stored : null
    if (!restored) {
      localStorage.removeItem(openKey)
      if (stored) localStorage.removeItem(draftBodyKey(draftScope, stored))
    }
    setDraft(restored)
    if (restored) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-review-line="${restored.start}"]`)?.scrollIntoView({ block: "center" }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  const submitNew = (body: string, type: CritiqueType) => {
    if (!fileProxy || !draft) return
    addComment
      .dispatch({
        scope: "located",
        critique_type: type,
        body,
        anchor: { type: "line_range", start_line: draft.start, end_line: draft.end },
      })
      .catch(() => undefined)
    close()
  }

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const blockAt = (x: number, y: number): number | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-review-block]")
      const value = el?.getAttribute("data-review-block")
      return value ? Number(value) : null
    }
    const move = (event: PointerEvent) => {
      const idx = blockAt(event.clientX, event.clientY)
      if (idx != null) setDrag((current) => (current && current.to !== idx ? { ...current, to: idx } : current))
    }
    const up = () => {
      const current = dragRef.current
      setDrag(null)
      if (current) {
        const lo = Math.min(current.from, current.to)
        const hi = Math.max(current.from, current.to)
        requestOpen({ start: blocks[lo].line, end: blocks[hi].endLine })
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const dragLo = drag ? Math.min(drag.from, drag.to) : -1
  const dragHi = drag ? Math.max(drag.from, drag.to) : -1

  return (
    <div className="shrink-0">
      <div className="md-doc py-4">
        {blocks.map((block, index) => {
          const threads = threadsByBlock.get(index)
          const inDrag = drag !== null && index >= dragLo && index <= dragHi
          const inDraft = draft !== null && block.line >= draft.start && block.endLine <= draft.end
          const selecting = inDrag || inDraft
          const focused = highlightedRange !== null && highlightedRange.start >= block.line && highlightedRange.start <= block.endLine
          const composerHere = draft !== null && drag === null && block.endLine === draft.end && block.line >= draft.start
          const label = draft ? `line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}` : ""
          const composerOpen = composerHere && draft !== null
          const gutterButton = (
            <button
              type="button"
              data-review-block={index}
              onPointerDown={(event) => {
                if (event.shiftKey && draft) open({ start: Math.min(draft.start, block.line), end: Math.max(draft.end, block.endLine) })
                else setDrag({ from: index, to: index })
              }}
              onClick={(event) => {
                if (event.shiftKey) return
                requestOpen({ start: block.line, end: block.endLine })
              }}
              style={{ minWidth: `${gutter + 2}ch`, touchAction: "none" }}
              title="Comment on this block — drag or shift-click for a range"
              className={`group/gut relative flex shrink-0 cursor-pointer select-none flex-col items-end px-3 pt-[0.4em] pb-[0.4em] text-right font-mono text-[10.5px] tabular-nums ${
                selecting || focused ? "bg-accent-soft font-semibold text-accent-bright" : "text-faint hover:text-accent-bright"
              }`}
            >
              <span data-review-line={block.line} className="group-hover/gut:opacity-0">
                {block.line}
              </span>
              {block.endLine > block.line && (
                <>
                  <span aria-hidden className="my-1 w-px flex-1 bg-hair-strong group-hover/gut:opacity-0" />
                  <span className="group-hover/gut:opacity-0">{block.endLine}</span>
                </>
              )}
              <Plus size={12} aria-hidden className="absolute right-2.5 top-[0.4em] hidden group-hover/gut:block" />
            </button>
          )

          return (
            <Fragment key={index}>
              <div className={`flex ${selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}>
                {composerMode === "popover" ? (
                  <Popover
                    open={composerOpen}
                    onOpenChange={(next) => {
                      if (next) requestOpen({ start: block.line, end: block.endLine })
                      else if (composerOpen) close()
                    }}
                    side="right"
                    align="start"
                    chrome={false}
                    className="w-[330px] p-0"
                    render={gutterButton}
                  >
                    {composerOpen && draft && (
                      <Composer
                        anchorLabel={label}
                        draftKey={draftBodyKey(draftScope, draft)}
                        pending={addComment.isPending}
                        className="m-0"
                        onSubmit={submitNew}
                        onCancel={close}
                      />
                    )}
                  </Popover>
                ) : (
                  gutterButton
                )}
                <div
                  className="md-body min-w-0 flex-1 pb-1 pr-4 text-[13.5px] leading-[1.6] text-ink"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              </div>
              {composerMode === "inline" && composerHere && draft && (
                <Composer
                  anchorLabel={label}
                  draftKey={draftBodyKey(draftScope, draft)}
                  pending={addComment.isPending}
                  onSubmit={submitNew}
                  onCancel={close}
                />
              )}
              {showThreads && threads?.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  commentsProxy={commentsProxy}
                  focused={focusedCommentId === comment.id}
                  onFocus={onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined}
                />
              ))}
            </Fragment>
          )
        })}
      </div>
      <ConfirmDialog
        open={switchTo !== null}
        title="Discard unsaved comment?"
        body="You have an unfinished comment open. Starting another one here discards it."
        confirmLabel="Discard"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          if (draft) localStorage.removeItem(draftBodyKey(draftScope, draft))
          if (switchTo) open(switchTo)
          setSwitchTo(null)
        }}
      />
    </div>
  )
})

export const Source = observer(function Source({
  lines,
  tokens,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
  readOnly = false,
  showThreads = true,
  composerMode = "inline",
  focusedCommentId = null,
  highlightedRange = null,
  onFocusComment,
}: {
  lines: string[]
  tokens: ThemedToken[][] | null
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
  readOnly?: boolean
  showThreads?: boolean
  composerMode?: ComposerMode
  focusedCommentId?: string | null
  highlightedRange?: HighlightRange
  onFocusComment?: (commentId: string | null) => void
}) {
  const rows = tokens ?? lines.map((line) => [{ content: line, color: "" } as ThemedToken])
  const count = rows.length
  const gutter = String(count).length
  const wrap = uiStore.codeWrap
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  const threadsByLine = useMemo(() => {
    const map = new Map<number, Comment[]>()
    const last = count || 1
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const start = Math.min(Math.max(comment.anchor.start_line, 1), last)
      const end = Math.min(Math.max(comment.anchor.end_line, start), last)
      const bucket = map.get(end)
      if (bucket) bucket.push(comment)
      else map.set(end, [comment])
    }
    return map
  }, [comments, count])

  const [draft, setDraft] = useState<Range | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const [switchTo, setSwitchTo] = useState<Range | null>(null)
  const draftRef = useRef<Range | null>(draft)
  draftRef.current = draft
  const openKey = `suikou-composer:${draftScope}`

  useEffect(() => {
    const raw = localStorage.getItem(openKey)
    const stored = raw ? safeRange(raw) : null
    const inRange = stored !== null && stored.start >= 1 && stored.end <= count
    const restored = stored && inRange && hasDraftBody(draftScope, stored) ? stored : null
    if (!restored) {
      localStorage.removeItem(openKey)
      if (stored) localStorage.removeItem(draftBodyKey(draftScope, stored))
    }
    setDraft(restored)
    if (restored) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-review-line="${restored.end}"]`)?.scrollIntoView({ block: "center" }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  const open = (range: Range) => {
    setDraft(range)
    localStorage.setItem(openKey, JSON.stringify(range))
  }
  const close = () => {
    const current = draftRef.current
    if (current) localStorage.removeItem(draftBodyKey(draftScope, current))
    localStorage.removeItem(openKey)
    setDraft(null)
  }
  const requestOpen = (range: Range) => {
    if (readOnly) return
    const current = draftRef.current
    if (current && !sameRange(current, range) && hasDraftBody(draftScope, current)) setSwitchTo(range)
    else open(range)
  }

  const dragging = drag !== null
  const dragRef = useRef(drag)
  dragRef.current = drag
  useEffect(() => {
    if (!dragging) return
    const lineAt = (x: number, y: number): number | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-review-line]")
      const value = el?.getAttribute("data-review-line")
      return value ? Number(value) : null
    }
    const move = (event: PointerEvent) => {
      const line = lineAt(event.clientX, event.clientY)
      if (line != null) setDrag((current) => (current && current.to !== line ? { ...current, to: line } : current))
    }
    const up = () => {
      const current = dragRef.current
      setDrag(null)
      if (current) requestOpen({ start: Math.min(current.from, current.to), end: Math.max(current.from, current.to) })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const submitNew = (body: string, type: CritiqueType) => {
    if (!fileProxy || !draft) return
    addComment
      .dispatch({
        scope: "located",
        critique_type: type,
        body,
        anchor: { type: "line_range", start_line: draft.start, end_line: draft.end },
      })
      .catch(() => undefined)
    close()
  }

  return (
    <div className="shrink-0 py-1 font-mono leading-[1.55]" style={{ fontSize: MONO_PX[uiStore.monoSize] }}>
      {rows.map((lineTokens, index) => {
        const lineNo = index + 1
        const threads = threadsByLine.get(lineNo)
        const active = drag ? { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) } : draft
        const selecting = active && lineNo >= active.start && lineNo <= active.end
        const focused = highlightedRange !== null && lineNo >= highlightedRange.start && lineNo <= highlightedRange.end
        const composerOpen = draft !== null && draft.end === lineNo
        const gutterButton = (
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.shiftKey && draft) open({ start: Math.min(draft.start, lineNo), end: Math.max(draft.start, lineNo) })
              else setDrag({ from: lineNo, to: lineNo })
            }}
            onClick={(event) => {
              if (event.shiftKey) return
              requestOpen({ start: lineNo, end: lineNo })
            }}
            style={{ minWidth: `${gutter + 2}ch`, touchAction: "none" }}
            title="Comment on this line — drag or shift-click for a range"
            className={`group/gut sticky left-0 shrink-0 cursor-pointer select-none px-3 text-right tabular-nums ${
              selecting || focused
                ? "bg-accent-soft font-semibold text-accent-bright"
                : "bg-editor text-faint hover:text-accent-bright"
            }`}
          >
            <span className="group-hover/gut:opacity-0">{lineNo}</span>
            <Plus size={12} aria-hidden className="absolute inset-y-0 right-2.5 my-auto hidden group-hover/gut:block" />
          </button>
        )

        return (
          <Fragment key={index}>
            <div data-review-line={lineNo} className={`flex scroll-mt-2 ${selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}>
              {composerMode === "popover" ? (
                <Popover
                  open={composerOpen}
                  onOpenChange={(next) => {
                    if (next) requestOpen({ start: lineNo, end: lineNo })
                    else if (composerOpen) close()
                  }}
                  side="right"
                  align="start"
                  chrome={false}
                  className="w-[330px] p-0"
                  render={gutterButton}
                >
                  {composerOpen && draft && (
                    <Composer
                      anchorLabel={`line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}`}
                      draftKey={draftBodyKey(draftScope, draft)}
                      pending={addComment.isPending}
                      suggestSeed={lines.slice(draft.start - 1, draft.end).join("\n")}
                      className="m-0"
                      onSubmit={submitNew}
                      onCancel={close}
                    />
                  )}
                </Popover>
              ) : (
                gutterButton
              )}
              <code className={`pr-6 text-text ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>
                {lineTokens.length === 0 ? " " : lineTokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
                    {token.content}
                  </span>
                ))}
              </code>
            </div>
            {composerMode === "inline" && draft && draft.end === lineNo && (
              <Composer
                anchorLabel={`line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}`}
                draftKey={draftBodyKey(draftScope, draft)}
                pending={addComment.isPending}
                suggestSeed={lines.slice(draft.start - 1, draft.end).join("\n")}
                onSubmit={submitNew}
                onCancel={close}
              />
            )}
            {showThreads && threads?.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                commentsProxy={commentsProxy}
                focused={focusedCommentId === comment.id}
                onFocus={onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined}
              />
            ))}
          </Fragment>
        )
      })}
      <ConfirmDialog
        open={switchTo !== null}
        title="Discard unsaved comment?"
        body="You have an unfinished comment open. Starting another one here discards it."
        confirmLabel="Discard"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          if (draft) localStorage.removeItem(draftBodyKey(draftScope, draft))
          if (switchTo) open(switchTo)
          setSwitchTo(null)
        }}
      />
    </div>
  )
})

function sameRange(a: Range, b: Range): boolean {
  return a.start === b.start && a.end === b.end
}

function safeRange(raw: string): Range | null {
  try {
    const value = JSON.parse(raw)
    return typeof value?.start === "number" && typeof value?.end === "number" ? { start: value.start, end: value.end } : null
  } catch {
    return null
  }
}

function draftBodyKey(scope: string, range: Range): string {
  return `suikou-draft:${scope}:${range.start}-${range.end}`
}

function hasDraftBody(scope: string, range: Range): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(draftBodyKey(scope, range)) || "{}")
    return typeof value?.body === "string" && value.body.trim().length > 0
  } catch {
    return false
  }
}
