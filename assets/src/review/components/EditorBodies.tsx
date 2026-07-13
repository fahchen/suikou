import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"
import type { ThemedToken } from "shiki"
import { ChevronRight, Crosshair, Plus } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import { uiStore, MONO_SIZE } from "../../stores/ui-store"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { Popover } from "../../components/ui/popover"
import { renderMarkdownBlocks, useMermaid, type MarkdownBlock } from "../markdown"
import type { Comment, CommentsStoreProxy, CritiqueType } from "./comments/shared"
import { Composer } from "./comments/Composer"
import { CommentThread } from "./comments/CommentThread"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type Range = { start: number; end: number }
type HighlightRange = Range | null
type ComposerMode = "inline" | "popover"

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
  const docRef = useRef<HTMLDivElement>(null)
  useMermaid(docRef, [blocks])
  const gutter = String(blocks.length ? blocks[blocks.length - 1].endLine : 1).length
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  const threadsByBlock = useMemo(() => {
    const map = new Map<number, Comment[]>()
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const end = comment.anchor.end_line
      let idx = blocks.findIndex((block) => end >= block.line && end <= block.endLine)
      if (idx === -1) {
        idx = 0
        for (let i = 0; i < blocks.length; i += 1) if (blocks[i].line <= end) idx = i
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
      .then(close)
      .catch(() => undefined)
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
      if (idx != null) {
        setDrag((current) => {
          const next = current && current.to !== idx ? { ...current, to: idx } : current
          dragRef.current = next
          return next
        })
      }
    }
    const cancel = () => {
      dragRef.current = null
      setDrag(null)
    }
    const up = (event: PointerEvent) => {
      const current = dragRef.current
      cancel()
      if (event.button !== 0) return
      if (current) {
        const lo = Math.min(current.from, current.to)
        const hi = Math.max(current.from, current.to)
        requestOpen({ start: blocks[lo].line, end: blocks[hi].endLine })
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const dragLo = drag ? Math.min(drag.from, drag.to) : -1
  const dragHi = drag ? Math.max(drag.from, drag.to) : -1

  const foldKey = `suikou-fold:${draftScope}`
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadFold(foldKey))
  useEffect(() => setCollapsed(loadFold(foldKey)), [foldKey])
  const toggleFold = (line: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      persistFold(foldKey, next)
      return next
    })
  const hidden = useMemo(() => hiddenBlocks(blocks, collapsed), [blocks, collapsed])

  return (
    <div className="shrink-0">
      <div ref={docRef} className="md-doc py-4">
        {(() => {
          const rendered: ReactNode[] = []
          let codeBuf: ReactNode[] = []
          let segKey = ""
          let segGroup: string | null = null
          const flushCode = () => {
            if (codeBuf.length === 0) return
            rendered.push(
              <div key={`fence-${segKey}`} className="md-fence-scroll">
                <div className="md-fence-track">{codeBuf}</div>
              </div>,
            )
            codeBuf = []
            segGroup = null
          }

          blocks.forEach((block, index) => {
            if (hidden.has(index)) return
            const isCode = block.codeGroup != null
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
                  if (event.button !== 0) return
                  if (event.shiftKey && draft) open({ start: Math.min(draft.start, block.line), end: Math.max(draft.end, block.endLine) })
                  else {
                    const next = { from: index, to: index }
                    dragRef.current = next
                    setDrag(next)
                  }
                }}
                onPointerUp={(event) => {
                  const current = dragRef.current
                  if (event.button !== 0 || event.shiftKey || !current || current.from !== current.to) return
                  dragRef.current = null
                  setDrag(null)
                  if (composerMode === "inline") requestOpen({ start: block.line, end: block.endLine })
                }}
                onClick={(event) => {
                  if (event.shiftKey || composerMode === "popover" || event.detail !== 0) return
                  requestOpen({ start: block.line, end: block.endLine })
                }}
                style={{
                  minWidth: `${gutter + 2}ch`,
                  touchAction: "none",
                  // Code gutters sit inside a horizontal scroll container; pin them
                  // and give an opaque backdrop so scrolled code can't show through.
                  ...(isCode
                    ? { position: "sticky" as const, left: 0, zIndex: 1, background: selecting || focused ? undefined : "var(--bg-1)" }
                    : {}),
                }}
                title="Comment on this block — drag or shift-click for a range"
                className={`group/gut relative flex shrink-0 cursor-pointer select-none flex-col items-end px-3 pt-[0.4em] pb-[0.4em] text-right font-mono text-2xs tabular-nums ${
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

            const foldToggle = block.heading ? (
              <button
                type="button"
                onClick={() => toggleFold(block.line)}
                title={collapsed.has(block.line) ? "Expand section" : "Collapse section"}
                style={{ marginTop: headingToggleOffset(block.heading) }}
                className="flex shrink-0 items-center self-start px-2 text-faint opacity-0 transition-opacity hover:text-accent-bright focus-visible:opacity-100 group-hover/md:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <ChevronRight
                  size={14}
                  className={`transition-transform ${collapsed.has(block.line) ? "" : "rotate-90"}`}
                />
              </button>
            ) : null

            const row = (
              <div key={index} className={`group/md flex ${selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}>
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
                  className={`md-body min-w-0 pb-1 pr-4 text-sm leading-[1.6] text-ink ${block.heading ? "" : "flex-1"}`}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
                {foldToggle}
              </div>
            )

            const extras =
              (composerMode === "inline" && composerHere && draft) || (showThreads && threads && threads.length > 0) ? (
                <Fragment key={`extras-${index}`}>
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
              ) : null

            // Code lines share one horizontal scroll container. A comment or
            // composer breaks the fence (it renders full-width outside the
            // scroller), so flush the buffer before emitting it.
            if (isCode) {
              // A new fence (different codeGroup) starts its own scroll container.
              if (codeBuf.length > 0 && block.codeGroup !== segGroup) flushCode()
              if (codeBuf.length === 0) {
                segKey = String(index)
                segGroup = block.codeGroup ?? null
              }
              codeBuf.push(row)
              if (extras) {
                flushCode()
                rendered.push(extras)
              }
            } else {
              flushCode()
              rendered.push(
                <Fragment key={index}>
                  {row}
                  {extras}
                </Fragment>,
              )
            }
          })

          flushCode()
          return rendered
        })()}
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

  // E16: a located comment whose start line no longer exists in the file (the
  // file shrank past its anchor) is stranded — it can't render inline, so it
  // surfaces at the top for re-anchoring instead of silently clamping to the
  // last line.
  const { threadsByLine, strandedComments } = useMemo(() => {
    const map = new Map<number, Comment[]>()
    const stranded: Comment[] = []
    const last = count || 1
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      if (comment.anchor.start_line > last) {
        stranded.push(comment)
        continue
      }
      const start = Math.min(Math.max(comment.anchor.start_line, 1), last)
      const end = Math.min(Math.max(comment.anchor.end_line, start), last)
      const bucket = map.get(end)
      if (bucket) bucket.push(comment)
      else map.set(end, [comment])
    }
    return { threadsByLine: map, strandedComments: stranded }
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
      if (line != null) {
        setDrag((current) => {
          const next = current && current.to !== line ? { ...current, to: line } : current
          dragRef.current = next
          return next
        })
      }
    }
    const cancel = () => {
      dragRef.current = null
      setDrag(null)
    }
    const up = (event: PointerEvent) => {
      const current = dragRef.current
      cancel()
      if (event.button !== 0) return
      if (current) requestOpen({ start: Math.min(current.from, current.to), end: Math.max(current.from, current.to) })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
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
      .then(close)
      .catch(() => undefined)
  }

  return (
    <div className={`shrink-0 py-1 font-mono leading-[1.55] ${MONO_SIZE[uiStore.monoSize]}`}>
      {showThreads && strandedComments.length > 0 && (
        <div className="mx-3 mb-2 rounded-panel border border-hair-strong bg-soft/40 p-2 font-sans">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Crosshair size={12} className="text-accent" />
            Stranded {strandedComments.length === 1 ? "comment" : "comments"}
            <span className="font-normal normal-case tracking-normal text-faint">· anchor line no longer exists</span>
          </div>
          {strandedComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              commentsProxy={commentsProxy}
              className="my-1"
              focused={focusedCommentId === comment.id}
              onFocus={onFocusComment ? () => onFocusComment(focusedCommentId === comment.id ? null : comment.id) : undefined}
            />
          ))}
        </div>
      )}
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
              if (event.button !== 0) return
              if (event.shiftKey && draft) open({ start: Math.min(draft.start, lineNo), end: Math.max(draft.start, lineNo) })
              else {
                const next = { from: lineNo, to: lineNo }
                dragRef.current = next
                setDrag(next)
              }
            }}
            onPointerUp={(event) => {
              const current = dragRef.current
              if (event.button !== 0 || event.shiftKey || !current || current.from !== current.to) return
              dragRef.current = null
              setDrag(null)
              if (composerMode === "inline") requestOpen({ start: lineNo, end: lineNo })
            }}
            onClick={(event) => {
              if (event.shiftKey || composerMode === "popover" || event.detail !== 0) return
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

// Top offset (px) that centers the fold chevron on a heading's first text line,
// mirroring the heading font-size/margin scale in index.css. md-body is text-sm
// (14px) with leading 1.6; the chevron is 14px tall.
function headingToggleOffset(level: number): number {
  const scale: Record<number, { fs: number; mt: number }> = {
    1: { fs: 1.55, mt: 0.1 },
    2: { fs: 1.28, mt: 0.7 },
    3: { fs: 1.1, mt: 0.55 },
  }
  const { fs, mt } = scale[level] ?? { fs: 1, mt: 0.5 }
  const fsPx = fs * 14
  return mt * fsPx + (fsPx * 1.6) / 2 - 7
}

function loadFold(key: string): Set<number> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]")
    return new Set(Array.isArray(value) ? value.filter((n) => typeof n === "number") : [])
  } catch {
    return new Set()
  }
}

function persistFold(key: string, lines: Set<number>): void {
  if (lines.size === 0) localStorage.removeItem(key)
  else localStorage.setItem(key, JSON.stringify([...lines]))
}

// Block indices hidden because a collapsed heading owns them: everything after a
// collapsed heading up to the next heading of equal or higher rank.
function hiddenBlocks(blocks: MarkdownBlock[], collapsed: Set<number>): Set<number> {
  const hidden = new Set<number>()
  for (let i = 0; i < blocks.length; i += 1) {
    const level = blocks[i].heading
    if (!level || !collapsed.has(blocks[i].line)) continue
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j].heading
      if (next && next <= level) break
      hidden.add(j)
    }
  }
  return hidden
}
