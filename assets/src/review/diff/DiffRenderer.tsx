import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import type { ThemedToken } from "shiki"
import { diffWords } from "diff"
import { Plus } from "lucide-react"

import { highlightLines } from "../highlight"
import { parseDiffPatch, type DiffFile, type DiffHunk, type DiffLine } from "./parse"

export type DiffAnnotation<Meta = unknown> = {
  side: "old" | "new"
  startLine: number
  endLine: number
  meta: Meta
}

/** A pending new-comment selection: a contiguous line range on one diff side. */
export type DiffDraft = { side: "old" | "new"; start: number; end: number }

export type DiffRendererProps<A = unknown> = {
  patch: string
  diffStyle: "unified" | "split"
  lineAnnotations?: DiffAnnotation<A>[]
  selectedRange?: { side: "old" | "new"; start: number; end: number } | null
  renderAnnotation?: (annotation: DiffAnnotation<A>) => React.ReactNode
  /** File extension without dot (e.g. `"ex"`), used to pick a shiki grammar.
   * Absent → plain-text tokenization. */
  languageHint?: string
  /** When true, paired del/add lines get inline word-level highlights on the
   * exact characters that changed. Pure adds / pure dels stay plain-highlighted. */
  wordDiff?: boolean
  /** When true, gutters become click/drag targets that open a composer for a new
   * `diff_hunk` comment. `renderComposer` supplies the composer body. */
  commentable?: boolean
  renderComposer?: (draft: DiffDraft, close: () => void) => React.ReactNode
}

/** Selection controller shared with every row via context, so the gutter buttons
 * deep in the tree can drive one draft/drag state without prop-drilling.
 * ponytail: Suikou diff reviews are per-file artifacts — DiffView always renders
 * one file's patch — so the draft is keyed by (side, line) only, not fileIndex. */
type DiffSelect = {
  draft: DiffDraft | null
  drag: DiffDraft | null
  begin: (side: "old" | "new", line: number) => void
  close: () => void
  renderComposer: (draft: DiffDraft, close: () => void) => React.ReactNode
}

const DiffSelectContext = createContext<DiffSelect | null>(null)

/** A contiguous character range on one line that should be tinted as the
 * "same" or "changed" side of a word-diff pair. `kind === "shared"` means
 * the range is common to both del and add lines and only gets the row's
 * ambient background; `"changed"` gets the extra inline tint. */
type WordSegment = { start: number; end: number; kind: "shared" | "changed" }

/** Per-hunk word-diff lookup, keyed by anchor line number on each side. Only
 * lines that were part of a paired del/add run appear here; the renderer falls
 * back to plain shiki output for everything else. */
type WordDiffMap = {
  del: Map<number, WordSegment[]>
  add: Map<number, WordSegment[]>
}

const EMPTY_WORD_DIFF: WordDiffMap = { del: new Map(), add: new Map() }

/** Highlighted tokens for a whole DiffFile, keyed by side + line-number so the
 * unified/split renderer can look up any row in O(1). */
type FileTokens = {
  add: Map<number, ThemedToken[]>
  del: Map<number, ThemedToken[]>
  /** Context lines are keyed by newLine — the source-of-truth line number for
   * the context on the post-image side. */
  ctx: Map<number, ThemedToken[]>
}

const EMPTY_TOKENS: FileTokens = {
  add: new Map(),
  del: new Map(),
  ctx: new Map(),
}

/** Diff renderer. Reuses the same shiki path as Suikou's source-file view so
 * token colors are identical, and paints add/del rows from Suikou's
 * `--approve-*`/`--request-*` tokens instead of a library palette. */
export const DiffRenderer = observer(function DiffRenderer<A>(props: DiffRendererProps<A>) {
  const { patch, diffStyle, lineAnnotations, selectedRange, renderAnnotation, languageHint, wordDiff, commentable, renderComposer } = props

  const files = useMemo(() => parseDiffPatch(patch), [patch])
  const tokens = useFileTokens(files, languageHint)
  const wordDiffMaps = useMemo(
    () => (wordDiff ? files.map((file) => buildWordDiffMap(file)) : []),
    [files, wordDiff],
  )
  const select = useDiffSelection(commentable === true ? renderComposer : undefined)

  const body = (
    <div className="min-h-0 flex-1 overflow-auto">
      {files.map((file, fileIndex) => (
        <DiffFileView<A>
          key={`${file.newPath ?? file.oldPath ?? "file"}:${fileIndex}`}
          file={file}
          tokens={tokens[fileIndex] ?? EMPTY_TOKENS}
          wordDiff={wordDiff === true ? wordDiffMaps[fileIndex] ?? EMPTY_WORD_DIFF : EMPTY_WORD_DIFF}
          diffStyle={diffStyle}
          lineAnnotations={lineAnnotations}
          selectedRange={selectedRange}
          renderAnnotation={renderAnnotation}
          multiFile={files.length > 1}
        />
      ))}
    </div>
  )
  return select ? <DiffSelectContext.Provider value={select}>{body}</DiffSelectContext.Provider> : body
}) as <A>(props: DiffRendererProps<A>) => React.ReactElement

/** Drag/click line-selection for new diff comments, mirroring the source view:
 * pointer-down on a gutter starts a drag, window pointer-move extends it over
 * rows on the same side (read from `data-diff-side`/`data-diff-line`), and
 * pointer-up opens a composer for the resulting range. Returns null when the
 * diff isn't commentable. */
function useDiffSelection(
  renderComposer: ((draft: DiffDraft, close: () => void) => React.ReactNode) | undefined,
): DiffSelect | null {
  const [draft, setDraft] = useState<DiffDraft | null>(null)
  const [drag, setDrag] = useState<DiffDraft | null>(null)
  const dragRef = useRef<DiffDraft | null>(drag)
  dragRef.current = drag

  useEffect(() => {
    if (drag === null) return
    const lineAt = (x: number, y: number): { side: "old" | "new"; line: number } | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-diff-line]")
      const side = el?.getAttribute("data-diff-side")
      const line = el?.getAttribute("data-diff-line")
      if ((side !== "old" && side !== "new") || !line) return null
      return { side, line: Number(line) }
    }
    const move = (event: PointerEvent) => {
      const hit = lineAt(event.clientX, event.clientY)
      if (!hit) return
      setDrag((current) => {
        if (!current || current.side !== hit.side || current.end === hit.line) return current
        const next = { ...current, end: hit.line }
        dragRef.current = next
        return next
      })
    }
    const cancel = () => {
      dragRef.current = null
      setDrag(null)
    }
    const up = (event: PointerEvent) => {
      const current = dragRef.current
      cancel()
      if (event.button !== 0 || !current) return
      const [start, end] = [current.start, current.end].sort((a, b) => a - b)
      setDraft({ side: current.side, start, end })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [drag])

  if (!renderComposer) return null
  return {
    draft,
    drag,
    begin: (side, line) => {
      const next = { side, start: line, end: line }
      dragRef.current = next
      setDrag(next)
    },
    close: () => setDraft(null),
    renderComposer,
  }
}

/** Batch-highlight every file's content, returning per-file lookup maps.
 * Highlighting is async — until it resolves we render plain text so the diff
 * shape shows immediately (same convention as Source). */
function useFileTokens(files: DiffFile[], ext: string | undefined): FileTokens[] {
  const [state, setState] = useState<FileTokens[]>(() => files.map(() => EMPTY_TOKENS))

  useEffect(() => {
    let cancelled = false
    const language = ext ?? "text"
    Promise.all(
      files.map(async (file) => {
        const add = collect(file, "add")
        const del = collect(file, "del")
        const ctx = collect(file, "ctx")

        const [addTokens, delTokens, ctxTokens] = await Promise.all([
          highlightLines(add.map((row) => row.content).join("\n"), language),
          highlightLines(del.map((row) => row.content).join("\n"), language),
          highlightLines(ctx.map((row) => row.content).join("\n"), language),
        ])

        return {
          add: mapByLine(add, addTokens, "add"),
          del: mapByLine(del, delTokens, "del"),
          ctx: mapByLine(ctx, ctxTokens, "ctx"),
        }
      }),
    ).then((result) => {
      if (!cancelled) setState(result)
    })

    return () => {
      cancelled = true
    }
  }, [files, ext])

  return state
}

function collect(file: DiffFile, kind: DiffLine["kind"]): DiffLine[] {
  const out: DiffLine[] = []
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === kind) out.push(line)
    }
  }
  return out
}

function mapByLine(
  rows: DiffLine[],
  tokens: ThemedToken[][],
  kind: "add" | "del" | "ctx",
): Map<number, ThemedToken[]> {
  const map = new Map<number, ThemedToken[]>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const line = tokens[i] ?? []
    const key = kind === "add" ? (row as { newLine: number }).newLine : kind === "del" ? (row as { oldLine: number }).oldLine : (row as { newLine: number }).newLine
    map.set(key, line)
  }
  return map
}

function DiffFileView<A>({
  file,
  tokens,
  wordDiff,
  diffStyle,
  lineAnnotations,
  selectedRange,
  renderAnnotation,
  multiFile,
}: {
  file: DiffFile
  tokens: FileTokens
  wordDiff: WordDiffMap
  diffStyle: "unified" | "split"
  lineAnnotations: DiffAnnotation<A>[] | undefined
  selectedRange: { side: "old" | "new"; start: number; end: number } | null | undefined
  renderAnnotation: ((annotation: DiffAnnotation<A>) => React.ReactNode) | undefined
  multiFile: boolean
}) {
  if (file.isBinary) {
    return (
      <div className="border-b border-hair-strong px-4 py-2 text-[12px] text-muted">
        {multiFile && (file.newPath ?? file.oldPath) && (
          <span className="mr-2 font-mono text-ink">{file.newPath ?? file.oldPath}</span>
        )}
        Binary file — content not shown.
      </div>
    )
  }

  return (
    <div className={multiFile ? "border-b border-hair-strong" : undefined}>
      {multiFile && (file.newPath ?? file.oldPath) && (
        <div className="border-b border-hair-strong bg-canvas px-4 py-1.5 font-mono text-[11.5px] text-ink">
          {file.newPath ?? file.oldPath}
        </div>
      )}
      {file.hunks.map((hunk, hunkIndex) => (
        <HunkView<A>
          key={hunkIndex}
          hunk={hunk}
          tokens={tokens}
          wordDiff={wordDiff}
          diffStyle={diffStyle}
          lineAnnotations={lineAnnotations}
          selectedRange={selectedRange}
          renderAnnotation={renderAnnotation}
        />
      ))}
    </div>
  )
}

function HunkView<A>({
  hunk,
  tokens,
  wordDiff,
  diffStyle,
  lineAnnotations,
  selectedRange,
  renderAnnotation,
}: {
  hunk: DiffHunk
  tokens: FileTokens
  wordDiff: WordDiffMap
  diffStyle: "unified" | "split"
  lineAnnotations: DiffAnnotation<A>[] | undefined
  selectedRange: { side: "old" | "new"; start: number; end: number } | null | undefined
  renderAnnotation: ((annotation: DiffAnnotation<A>) => React.ReactNode) | undefined
}) {
  const annotations = lineAnnotations ?? []

  return (
    <div>
      <div className="border-y border-hair-strong bg-soft/60 px-3 py-1 font-mono text-[11px] text-muted">
        <span className="block truncate">{hunk.header}</span>
      </div>
      {diffStyle === "unified" ? (
        <UnifiedHunk<A>
          hunk={hunk}
          tokens={tokens}
          wordDiff={wordDiff}
          annotations={annotations}
          selectedRange={selectedRange ?? null}
          renderAnnotation={renderAnnotation}
        />
      ) : (
        <SplitHunk<A>
          hunk={hunk}
          tokens={tokens}
          wordDiff={wordDiff}
          annotations={annotations}
          selectedRange={selectedRange ?? null}
          renderAnnotation={renderAnnotation}
        />
      )}
    </div>
  )
}

/* ---------------- Unified ---------------- */

function UnifiedHunk<A>({
  hunk,
  tokens,
  wordDiff,
  annotations,
  selectedRange,
  renderAnnotation,
}: {
  hunk: DiffHunk
  tokens: FileTokens
  wordDiff: WordDiffMap
  annotations: DiffAnnotation<A>[]
  selectedRange: { side: "old" | "new"; start: number; end: number } | null
  renderAnnotation: ((annotation: DiffAnnotation<A>) => React.ReactNode) | undefined
}) {
  const select = useContext(DiffSelectContext)
  return (
    <div>
      {hunk.lines.map((line, index) => {
        const anchor = anchorLine(line)
        const inserted = anchor
          ? annotations.filter((a) => a.side === anchor.side && a.startLine === anchor.line)
          : []
        const composerHere =
          select?.draft && anchor && anchor.side === select.draft.side && anchor.line === select.draft.end
        return (
          <Fragment key={index}>
            <UnifiedRow
              line={line}
              tokens={tokens}
              wordDiff={wordDiff}
              highlighted={anchor !== null && isSelected(selectedRange, anchor.side, anchor.line)}
            />
            {composerHere && select?.draft && (
              <div className="border-t border-hair px-2 py-1.5">{select.renderComposer(select.draft, select.close)}</div>
            )}
            {renderAnnotation !== undefined &&
              inserted.map((annotation, i) => (
                <AnnotationRow<A>
                  key={i}
                  annotation={annotation}
                  render={renderAnnotation}
                  span="unified"
                />
              ))}
          </Fragment>
        )
      })}
    </div>
  )
}

function UnifiedRow({
  line,
  tokens,
  wordDiff,
  highlighted,
}: {
  line: DiffLine
  tokens: FileTokens
  wordDiff: WordDiffMap
  highlighted: boolean
}) {
  if (line.kind === "meta") {
    return (
      <div className="flex items-start pl-[76px] font-mono text-[11px] italic text-faint">
        <span className="whitespace-pre-wrap">{line.content}</span>
      </div>
    )
  }
  const rowClass = rowSurface(line.kind)
  const outline = highlighted ? " outline outline-2 -outline-offset-2 outline-accent" : ""
  const oldNo = line.kind === "add" ? "" : String(line.oldLine)
  const newNo = line.kind === "del" ? "" : String(line.newLine)
  const rowTokens = lookupTokens(line, tokens)
  const segments = lookupWordSegments(line, wordDiff)
  return (
    <div className={`flex items-start font-mono text-[12px] ${rowClass}${outline}`}>
      <Gutter value={oldNo} side={line.kind === "del" ? "old" : undefined} line={line.kind === "del" ? line.oldLine : undefined} />
      <Gutter value={newNo} side={line.kind === "del" ? undefined : "new"} line={line.kind === "del" ? undefined : line.newLine} />
      <Sigil kind={line.kind} />
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-text">
        <TokenLine tokens={rowTokens} fallback={line.content} segments={segments} kind={line.kind} />
      </code>
    </div>
  )
}

/* ---------------- Split ---------------- */

type SplitRow = {
  left: { line: DiffLine; number: number } | null
  right: { line: DiffLine; number: number } | null
}

/** Pair del/add runs so each del sits next to its matching add. Extra del or
 * add rows leak into the shorter side as `null` (empty cell). Context and meta
 * lines flush any open pairing run so they render on both sides / span. */
function pairForSplit(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []

  const flush = () => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) {
      const del = dels[i]
      const add = adds[i]
      rows.push({
        left: del ? { line: del, number: (del as { oldLine: number }).oldLine } : null,
        right: add ? { line: add, number: (add as { newLine: number }).newLine } : null,
      })
    }
    dels = []
    adds = []
  }

  for (const line of lines) {
    if (line.kind === "del") {
      dels.push(line)
      continue
    }
    if (line.kind === "add") {
      adds.push(line)
      continue
    }
    flush()
    if (line.kind === "ctx") {
      rows.push({
        left: { line, number: line.oldLine },
        right: { line, number: line.newLine },
      })
    } else {
      // meta — render across both sides.
      rows.push({ left: { line, number: 0 }, right: { line, number: 0 } })
    }
  }
  flush()
  return rows
}

function SplitHunk<A>({
  hunk,
  tokens,
  wordDiff,
  annotations,
  selectedRange,
  renderAnnotation,
}: {
  hunk: DiffHunk
  tokens: FileTokens
  wordDiff: WordDiffMap
  annotations: DiffAnnotation<A>[]
  selectedRange: { side: "old" | "new"; start: number; end: number } | null
  renderAnnotation: ((annotation: DiffAnnotation<A>) => React.ReactNode) | undefined
}) {
  const rows = useMemo(() => pairForSplit(hunk.lines), [hunk])
  const select = useContext(DiffSelectContext)

  return (
    <div>
      {rows.map((row, index) => {
        const leftKey = row.left && row.left.line.kind !== "meta" ? row.left.number : null
        const rightKey = row.right && row.right.line.kind !== "meta" ? row.right.number : null
        const insertedLeft =
          leftKey === null ? [] : annotations.filter((a) => a.side === "old" && a.startLine === leftKey)
        const insertedRight =
          rightKey === null ? [] : annotations.filter((a) => a.side === "new" && a.startLine === rightKey)
        const composerSide =
          select?.draft && ((select.draft.side === "old" && leftKey === select.draft.end) || (select.draft.side === "new" && rightKey === select.draft.end))
            ? select.draft.side
            : null
        return (
          <Fragment key={index}>
            <SplitRowView
              row={row}
              tokens={tokens}
              wordDiff={wordDiff}
              selectedRange={selectedRange}
            />
            {composerSide && select?.draft && (
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className={`border-t border-hair px-2 py-1.5 ${composerSide === "old" ? "md:col-start-1 md:col-end-2" : "md:col-start-2 md:col-end-3"}`}>
                  {select.renderComposer(select.draft, select.close)}
                </div>
              </div>
            )}
            {renderAnnotation !== undefined &&
              insertedLeft.map((annotation, i) => (
                <AnnotationRow<A>
                  key={`l:${i}`}
                  annotation={annotation}
                  render={renderAnnotation}
                  span="split-left"
                />
              ))}
            {renderAnnotation !== undefined &&
              insertedRight.map((annotation, i) => (
                <AnnotationRow<A>
                  key={`r:${i}`}
                  annotation={annotation}
                  render={renderAnnotation}
                  span="split-right"
                />
              ))}
          </Fragment>
        )
      })}
    </div>
  )
}

function SplitRowView({
  row,
  tokens,
  wordDiff,
  selectedRange,
}: {
  row: SplitRow
  tokens: FileTokens
  wordDiff: WordDiffMap
  selectedRange: { side: "old" | "new"; start: number; end: number } | null
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2">
      <SplitCell
        cell={row.left}
        tokens={tokens}
        wordDiff={wordDiff}
        side="old"
        selectedRange={selectedRange}
      />
      <SplitCell
        cell={row.right}
        tokens={tokens}
        wordDiff={wordDiff}
        side="new"
        selectedRange={selectedRange}
      />
    </div>
  )
}

function SplitCell({
  cell,
  tokens,
  wordDiff,
  side,
  selectedRange,
}: {
  cell: { line: DiffLine; number: number } | null
  tokens: FileTokens
  wordDiff: WordDiffMap
  side: "old" | "new"
  selectedRange: { side: "old" | "new"; start: number; end: number } | null
}) {
  if (cell === null) {
    // Empty cell — subtle diagonal stripes so the reader can tell it apart from
    // a blank context line.
    return (
      <div
        className="min-h-[20px] bg-[image:repeating-linear-gradient(-45deg,var(--color-soft)_0_1px,transparent_1px_6px)] opacity-40"
        aria-hidden
      />
    )
  }
  const line = cell.line
  if (line.kind === "meta") {
    return (
      <div className="flex items-start pl-[40px] font-mono text-[11px] italic text-faint">
        <span className="whitespace-pre-wrap">{line.content}</span>
      </div>
    )
  }
  const rowClass = rowSurface(line.kind)
  const highlighted = isSelected(selectedRange, side, cell.number)
  const outline = highlighted ? " outline outline-2 -outline-offset-2 outline-accent" : ""
  const lineNo = String(cell.number)
  const rowTokens = lookupTokens(line, tokens)
  const segments = lookupWordSegments(line, wordDiff)
  return (
    <div className={`flex items-start font-mono text-[12px] ${rowClass}${outline}`}>
      <Gutter value={lineNo} side={side} line={cell.number} />
      <Sigil kind={line.kind} />
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-text">
        <TokenLine tokens={rowTokens} fallback={line.content} segments={segments} kind={line.kind} />
      </code>
    </div>
  )
}

/* ---------------- Shared row pieces ---------------- */

function Gutter({ value, side, line }: { value: string; side?: "old" | "new"; line?: number }) {
  const select = useContext(DiffSelectContext)
  const base = "w-[38px] shrink-0 select-none pr-1.5 text-right font-mono text-[10.5px] tabular-nums leading-[1.6]"
  if (!select || side === undefined || line === undefined || value === "") {
    return <span className={`${base} text-faint`}>{value}</span>
  }
  const selecting = inActiveRange(select, side, line)
  return (
    <button
      type="button"
      data-diff-side={side}
      data-diff-line={line}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        select.begin(side, line)
      }}
      style={{ touchAction: "none" }}
      title="Comment on this line — drag for a range"
      className={`group/gut relative cursor-pointer ${base} ${
        selecting ? "bg-accent-soft font-semibold text-accent-bright" : "text-faint hover:text-accent-bright"
      }`}
    >
      <span className="group-hover/gut:opacity-0">{value}</span>
      <Plus size={11} aria-hidden className="absolute inset-y-0 right-1 my-auto hidden group-hover/gut:block" />
    </button>
  )
}

/** True when `(side, line)` falls inside the live drag or the open draft. */
function inActiveRange(select: DiffSelect, side: "old" | "new", line: number): boolean {
  const active = select.drag ?? select.draft
  if (!active || active.side !== side) return false
  const [lo, hi] = [active.start, active.end].sort((a, b) => a - b)
  return line >= lo && line <= hi
}

function Sigil({ kind }: { kind: "add" | "del" | "ctx" }) {
  const glyph = kind === "add" ? "+" : kind === "del" ? "-" : " "
  return (
    <span className="w-[14px] shrink-0 select-none text-center font-mono text-[11.5px] leading-[1.6] text-faint">
      {glyph}
    </span>
  )
}

function TokenLine({
  tokens,
  fallback,
  segments,
  kind,
}: {
  tokens: ThemedToken[] | null
  fallback: string
  segments: WordSegment[] | null
  kind: "add" | "del" | "ctx"
}) {
  // No shiki tokens yet — render plaintext with segment overlays if any.
  if (tokens === null || tokens.length === 0) {
    if (segments === null || segments.length === 0) {
      return <>{fallback.length === 0 ? " " : fallback}</>
    }
    return (
      <>
        {segments.map((seg, index) => {
          const text = fallback.slice(seg.start, seg.end)
          if (text.length === 0) return null
          const bg = seg.kind === "changed" ? wordDiffBackground(kind) : undefined
          return (
            <span key={index} className={bg}>
              {text}
            </span>
          )
        })}
      </>
    )
  }
  // Fast path — no word-diff segments, just emit the shiki tokens.
  if (segments === null || segments.length === 0) {
    return (
      <>
        {tokens.map((token, index) => (
          <span key={index} style={token.color ? { color: token.color } : undefined}>
            {token.content}
          </span>
        ))}
      </>
    )
  }
  // Slow path — walk shiki tokens and diff segments in parallel by character
  // offset, splitting shiki tokens at segment boundaries and wrapping any
  // "changed" slice in an extra tint span. Shared slices keep the ambient row
  // background only.
  const spans = interleaveTokensWithSegments(tokens, segments, kind)
  return <>{spans}</>
}

/** Walk `tokens` and `segments` together by character offset. For each shiki
 * token, slice it at every segment boundary that falls inside it; emit each
 * slice as a `<span>` carrying the shiki color and — when the slice lands
 * inside a `"changed"` segment — the tint class for its side. */
function interleaveTokensWithSegments(
  tokens: ThemedToken[],
  segments: WordSegment[],
  kind: "add" | "del" | "ctx",
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let offset = 0
  let segIndex = 0
  let key = 0
  for (const token of tokens) {
    const tokenText = token.content
    const tokenEnd = offset + tokenText.length
    let cursor = offset
    while (cursor < tokenEnd) {
      // Advance to the segment covering `cursor`.
      while (segIndex < segments.length && segments[segIndex]!.end <= cursor) segIndex += 1
      const seg = segIndex < segments.length ? segments[segIndex]! : null
      // No segment covers this cursor — emit the rest of the token plainly.
      if (seg === null || seg.start >= tokenEnd) {
        const text = tokenText.slice(cursor - offset, tokenEnd - offset)
        nodes.push(
          <span key={key++} style={token.color ? { color: token.color } : undefined}>
            {text}
          </span>,
        )
        break
      }
      // Gap before the next segment.
      if (seg.start > cursor) {
        const sliceEnd = Math.min(seg.start, tokenEnd)
        const text = tokenText.slice(cursor - offset, sliceEnd - offset)
        nodes.push(
          <span key={key++} style={token.color ? { color: token.color } : undefined}>
            {text}
          </span>,
        )
        cursor = sliceEnd
        continue
      }
      // Inside a segment.
      const sliceEnd = Math.min(seg.end, tokenEnd)
      const text = tokenText.slice(cursor - offset, sliceEnd - offset)
      const bg = seg.kind === "changed" ? wordDiffBackground(kind) : undefined
      nodes.push(
        <span key={key++} className={bg} style={token.color ? { color: token.color } : undefined}>
          {text}
        </span>,
      )
      cursor = sliceEnd
    }
    offset = tokenEnd
  }
  return nodes
}

/** Inline tint for a `"changed"` word-diff slice on `del` / `add` rows. Uses
 * the raw `--request`/`--approve` variables with a stronger alpha than the
 * ambient `bg-*-soft` row surface so the exact changed characters stand out
 * without stomping shiki's token colors. `ctx` never receives word-diff. */
function wordDiffBackground(kind: "add" | "del" | "ctx"): string | undefined {
  if (kind === "add") {
    return "rounded-sm bg-[color:oklch(from_var(--approve)_l_c_h/0.40)] shadow-[inset_0_0_0_1px_var(--approve-edge)]"
  }
  if (kind === "del") {
    return "rounded-sm bg-[color:oklch(from_var(--request)_l_c_h/0.40)] shadow-[inset_0_0_0_1px_var(--request-edge)]"
  }
  return undefined
}

function AnnotationRow<A>({
  annotation,
  render,
  span,
}: {
  annotation: DiffAnnotation<A>
  render: (annotation: DiffAnnotation<A>) => React.ReactNode
  span: "unified" | "split-left" | "split-right"
}) {
  const grid = span === "unified" ? "" : span === "split-left" ? "md:col-start-1 md:col-end-2" : "md:col-start-2 md:col-end-3"
  return (
    <div className={span === "unified" ? "" : `grid grid-cols-1 md:grid-cols-2`}>
      <div className={`border-t border-hair px-2 py-1.5 ${grid}`}>{render(annotation)}</div>
    </div>
  )
}

/* ---------------- Helpers ---------------- */

function rowSurface(kind: "add" | "del" | "ctx"): string {
  if (kind === "add") return "bg-approve-soft border-l-2 border-approve-edge"
  if (kind === "del") return "bg-request-soft border-l-2 border-request-edge"
  return "border-l-2 border-transparent"
}

function anchorLine(line: DiffLine): { side: "old" | "new"; line: number } | null {
  if (line.kind === "add") return { side: "new", line: line.newLine }
  if (line.kind === "del") return { side: "old", line: line.oldLine }
  if (line.kind === "ctx") return { side: "new", line: line.newLine }
  return null
}

function isSelected(
  range: { side: "old" | "new"; start: number; end: number } | null | undefined,
  side: "old" | "new",
  line: number,
): boolean {
  if (!range) return false
  if (range.side !== side) return false
  return line >= range.start && line <= range.end
}

function lookupTokens(line: DiffLine, tokens: FileTokens): ThemedToken[] | null {
  if (line.kind === "add") return tokens.add.get(line.newLine) ?? null
  if (line.kind === "del") return tokens.del.get(line.oldLine) ?? null
  if (line.kind === "ctx") return tokens.ctx.get(line.newLine) ?? null
  return null
}

function lookupWordSegments(line: DiffLine, wordDiff: WordDiffMap): WordSegment[] | null {
  if (line.kind === "add") return wordDiff.add.get(line.newLine) ?? null
  if (line.kind === "del") return wordDiff.del.get(line.oldLine) ?? null
  return null
}

/** Walk each hunk, pairing consecutive del runs with the immediately-following
 * add run. Each `(delLine, addLine)` at matching index `i < min(delCount,
 * addCount)` gets a `diffWords` pass; leftover unpaired lines are skipped
 * (they render as plain adds/dels). */
function buildWordDiffMap(file: DiffFile): WordDiffMap {
  const map: WordDiffMap = { del: new Map(), add: new Map() }
  for (const hunk of file.hunks) {
    let dels: DiffLine[] = []
    let adds: DiffLine[] = []
    const flush = () => {
      const paired = Math.min(dels.length, adds.length)
      for (let i = 0; i < paired; i++) {
        const del = dels[i]! as { oldLine: number; content: string }
        const add = adds[i]! as { newLine: number; content: string }
        const { delSegments, addSegments } = wordSegmentsFor(del.content, add.content)
        map.del.set(del.oldLine, delSegments)
        map.add.set(add.newLine, addSegments)
      }
      dels = []
      adds = []
    }
    for (const line of hunk.lines) {
      if (line.kind === "del") {
        // A new del run after an add run — the previous group is complete.
        if (adds.length > 0) flush()
        dels.push(line)
        continue
      }
      if (line.kind === "add") {
        adds.push(line)
        continue
      }
      flush()
    }
    flush()
  }
  return map
}

/** Compute per-side `WordSegment[]` for a paired del/add line. The del side
 * skips `added` changes; the add side skips `removed` changes. Unchanged
 * regions become `"shared"` segments so the renderer can leave them plain. */
function wordSegmentsFor(delContent: string, addContent: string): {
  delSegments: WordSegment[]
  addSegments: WordSegment[]
} {
  const changes = diffWords(delContent, addContent)
  const delSegments: WordSegment[] = []
  const addSegments: WordSegment[] = []
  let delOffset = 0
  let addOffset = 0
  for (const change of changes) {
    const length = change.value.length
    if (change.added) {
      addSegments.push({ start: addOffset, end: addOffset + length, kind: "changed" })
      addOffset += length
      continue
    }
    if (change.removed) {
      delSegments.push({ start: delOffset, end: delOffset + length, kind: "changed" })
      delOffset += length
      continue
    }
    delSegments.push({ start: delOffset, end: delOffset + length, kind: "shared" })
    addSegments.push({ start: addOffset, end: addOffset + length, kind: "shared" })
    delOffset += length
    addOffset += length
  }
  return { delSegments, addSegments }
}
