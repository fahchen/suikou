import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"
import type { CommandReply, StoreProxy, StoreSnapshot } from "@musubi/react"
import type { ThemedToken } from "shiki"
import { AlertTriangle, Bot, ChevronDown, ChevronRight, Circle, CircleCheck, CornerDownRight, FileText, Folder, GitCompare, HelpCircle, ListTree, PanelLeft, Pencil, Plus, Search, SlidersHorizontal, StickyNote, Trash2, User, X } from "lucide-react"

import { storeCache, useMusubiCommand, useMusubiRoot, useMusubiSnapshot, useSocketConnected } from "../musubi"
import { uiStore, type MonoSize } from "../stores/ui-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { SettingsModal } from "../settings/SettingsModal"
import { FileIcon } from "../board/FileIcon"
import { highlightLines } from "./highlight"
import { renderMarkdown } from "./markdown"
import { langForPath, outline, type OutlineItem } from "../treesitter/outline"

type ReviewStore = StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
type Structure = CommandReply<"SuikouWeb.Stores.ReviewStore", "load_review_structure", Musubi.Stores>
type FileEntry = Structure["file_entries"][number]
type ReviewSnapshot = StoreSnapshot<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>
type Comment = ReviewSnapshot["body"]["files"][number]["comments"]["items"][number]
type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type CommentsStoreProxy = StoreProxy<"SuikouWeb.Stores.CommentsStore", Musubi.Stores>
type CritiqueType = "fix_required" | "needs_answer" | "note"

/** Review workbench: a full-viewport shell (toolbar · navigator · editor ·
 * inspector · status bar). Mounts the review's ReviewStore and reads its static
 * structure; file content and the live comment overlay arrive in later passes. */
export function ReviewPage({ reviewId, file }: { reviewId: string; file?: string }) {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: reviewId,
    params: { review_id: reviewId },
    cache: storeCache,
  })

  if (root.status === "loading") return <Centered>Loading review…</Centered>
  if (root.status === "error") return <Centered>Can't reach Suikou. {root.error.message}</Centered>
  return <Shell store={root.store} reviewId={reviewId} file={file} />
}

function Shell({ store, reviewId, file }: { store: ReviewStore; reviewId: string; file?: string }) {
  const load = useMusubiCommand(store, "load_review_structure")
  const connected = useSocketConnected()
  const snap = useMusubiSnapshot(store)
  const navigate = useNavigate()
  const [structure, setStructure] = useState<Structure | null>(null)
  const structRef = useRef<Structure | null>(null)
  structRef.current = structure

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const attempt = () => {
      load
        .dispatch({})
        .then((reply) => {
          if (!cancelled) setStructure(reply)
        })
        .catch(() => {
          if (cancelled) return
          attempts += 1
          if (structRef.current === null && attempts < 6) timer = setTimeout(attempt, 400)
        })
    }
    attempt()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, reviewId])

  const entries = useMemo(
    () => (structure?.file_entries ?? []).filter((e) => !e.soft_removed),
    [structure],
  )

  const [filesSheetOpen, setFilesSheetOpen] = useState(false)

  const isDiff = structure?.kind === "diff"
  // The open file lives in the URL (`?file=`), so a reload lands back on it; an
  // absent or stale param falls back to the first file.
  const selectedPath = entries.some((e) => e.path === file) ? file! : (entries[0]?.path ?? null)
  const selected = entries.find((e) => e.path === selectedPath) ?? null
  // Comment threads stream on the live snapshot; the structure (chrome, file
  // list) rides the command reply. Join them by path here.
  const fileIndex = snap?.body?.files.findIndex((f) => f.path === selectedPath) ?? -1
  const comments = useMemo(
    () => (fileIndex >= 0 ? (snap?.body?.files[fileIndex]?.comments.items ?? []) : []),
    [snap, fileIndex],
  )
  // The matching child proxies for authoring: the file's FileStore (add_comment)
  // and its CommentsStore (reply/edit/delete). `store.body` is safe to walk once
  // the snapshot carries a body — the same guard `fileIndex >= 0` implies.
  const fileProxy: FileStoreProxy | null = fileIndex >= 0 && snap?.body ? store.body.files[fileIndex] : null
  const commentsProxy: CommentsStoreProxy | null = fileProxy?.comments ?? null

  if (structure && !structure.exists) {
    return <Centered>Review not found.</Centered>
  }

  const select = (path: string) => {
    setFilesSheetOpen(false)
    navigate({ to: "/reviews/$reviewId", params: { reviewId }, search: { file: path } })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <Toolbar name={structure?.name ?? "…"} isDiff={isDiff} connected={connected} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[236px_1fr_300px]">
        <aside className="hidden min-h-0 flex-col border-r border-hair-strong bg-surface pt-3 lg:flex">
          <NavHeader entries={entries} />
          <FileList entries={entries} isDiff={isDiff} selectedPath={selectedPath} onSelect={select} />
        </aside>
        <Editor
          reviewId={reviewId}
          entry={selected}
          comments={comments}
          fileProxy={fileProxy}
          commentsProxy={commentsProxy}
          onOpenFiles={() => setFilesSheetOpen(true)}
        />
        <Inspector entries={entries} />
      </div>
      <StatusBar path={selectedPath} connected={connected} />
      <Dialog open={filesSheetOpen} onClose={() => setFilesSheetOpen(false)} className="max-h-[82vh] sm:max-w-[420px]">
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <FileText size={16} className="text-muted" aria-hidden />
          <DialogTitle className="text-[15px] font-bold text-ink">Files</DialogTitle>
          <span className="flex-1" />
          <span className="text-[12px] font-semibold text-muted tabular-nums">
            {entries.filter((e) => e.verdict !== null).length}/{entries.length}
          </span>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden pt-2">
          <FileList entries={entries} isDiff={isDiff} selectedPath={selectedPath} onSelect={select} />
        </div>
      </Dialog>
      <SettingsModal />
    </div>
  )
}

function Toolbar({ name, isDiff, connected }: { name: string; isDiff: boolean; connected: boolean }) {
  return (
    <div className="flex h-[50px] shrink-0 items-center gap-[9px] border-b border-hair-strong bg-surface px-3">
      <a
        href="/"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-ctrl px-2 hover:bg-soft"
        title={connected ? "Back to projects" : "Reconnecting…"}
      >
        <span
          className={`grid size-6 place-items-center rounded-[7px] bg-accent text-[13px] font-black text-on-accent ${
            connected ? "" : "animate-pulse"
          }`}
        >
          S
        </span>
      </a>
      <div className="inline-flex h-[30px] min-w-0 items-center gap-2 px-1">
        <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink">{name}</span>
        {isDiff && (
          <span className="ml-1 inline-flex h-[19px] shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-2 pl-1.5 text-[11px] font-semibold text-accent-bright">
            <GitCompare size={12} aria-hidden />
            Diff
          </span>
        )}
      </div>
      <span className="flex-1" />
      <button
        onClick={() => uiStore.setSettingsOpen(true)}
        className="grid size-[30px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        title="Settings"
      >
        <SlidersHorizontal size={16} aria-hidden />
      </button>
    </div>
  )
}

const STATUS_META: Record<
  NonNullable<FileEntry["change_status"]>,
  { letter: string; className: string; title: string }
> = {
  added: { letter: "A", className: "text-approve", title: "Added" },
  modified: { letter: "M", className: "text-amber", title: "Modified" },
  deleted: { letter: "D", className: "text-request", title: "Deleted" },
  renamed: { letter: "R", className: "text-muted", title: "Renamed" },
  copied: { letter: "C", className: "text-muted", title: "Copied" },
  type_changed: { letter: "T", className: "text-muted", title: "Type changed" },
}

function NavHeader({ entries }: { entries: FileEntry[] }) {
  return (
    <div className="flex items-center gap-[7px] px-3 pb-2">
      <FileText size={15} className="text-muted" aria-hidden />
      <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Files</h3>
      <span className="flex-1" />
      <span className="text-[11px] font-semibold text-muted tabular-nums">
        {entries.filter((e) => e.verdict !== null).length}/{entries.length}
      </span>
    </div>
  )
}

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; entry: FileEntry }

// Fold the flat file list into a directory tree; intermediate path segments
// become collapsible folders, the leaf keeps its FileEntry. Dirs sort before
// files, each level alphabetical.
function buildTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, Extract<TreeNode, { kind: "dir" }>>()
  for (const entry of entries) {
    const segs = entry.path.split("/")
    let level = root
    let prefix = ""
    for (let i = 0; i < segs.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${segs[i]}` : segs[i]
      let dir = dirs.get(prefix)
      if (!dir) {
        dir = { kind: "dir", name: segs[i], path: prefix, children: [] }
        dirs.set(prefix, dir)
        level.push(dir)
      }
      level = dir.children
    }
    level.push({ kind: "file", name: segs[segs.length - 1], path: entry.path, entry })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
    for (const node of nodes) if (node.kind === "dir") sort(node.children)
  }
  sort(root)
  return root
}

function FileList({
  entries,
  isDiff,
  selectedPath,
  onSelect,
}: {
  entries: FileEntry[]
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const [query, setQuery] = useState("")
  const [closedDirs, setClosedDirs] = useState<Set<string>>(new Set())
  const needle = query.trim().toLowerCase()
  const shown = needle ? entries.filter((e) => e.path.toLowerCase().includes(needle)) : entries
  const tree = useMemo(() => buildTree(shown), [shown])

  const toggleDir = (path: string) =>
    setClosedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <>
      <div className="mx-[10px] mb-[9px] flex h-[28px] shrink-0 items-center gap-[7px] rounded-ctrl bg-canvas px-2.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
        <Search size={13} className="shrink-0 text-faint" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1.5 pb-2">
        <TreeNodes
          nodes={tree}
          depth={0}
          isDiff={isDiff}
          selectedPath={selectedPath}
          onSelect={onSelect}
          // While filtering, ignore collapse state so every match is visible.
          closedDirs={needle ? EMPTY_SET : closedDirs}
          onToggleDir={toggleDir}
        />
        {shown.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-faint">No files match.</p>}
      </div>
    </>
  )
}

const EMPTY_SET: Set<string> = new Set()

function TreeNodes({
  nodes,
  depth,
  isDiff,
  selectedPath,
  onSelect,
  closedDirs,
  onToggleDir,
}: {
  nodes: TreeNode[]
  depth: number
  isDiff: boolean
  selectedPath: string | null
  onSelect: (path: string) => void
  closedDirs: Set<string>
  onToggleDir: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggleDir(node.path)}
              style={{ paddingLeft: 9 + depth * 12 }}
              className="flex h-[27px] w-full items-center gap-1.5 rounded-ctrl pr-2 text-left text-[12.5px] text-text hover:bg-soft"
            >
              <ChevronRight
                size={13}
                className={`shrink-0 text-faint transition-transform ${closedDirs.has(node.path) ? "" : "rotate-90"}`}
                aria-hidden
              />
              <Folder size={14} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
            {!closedDirs.has(node.path) && (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                isDiff={isDiff}
                selectedPath={selectedPath}
                onSelect={onSelect}
                closedDirs={closedDirs}
                onToggleDir={onToggleDir}
              />
            )}
          </div>
        ) : (
          <FileRow
            key={node.path}
            entry={node.entry}
            depth={depth}
            isDiff={isDiff}
            selected={node.path === selectedPath}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  )
}

function FileRow({
  entry,
  depth,
  isDiff,
  selected,
  onSelect,
}: {
  entry: FileEntry
  depth: number
  isDiff: boolean
  selected: boolean
  onSelect: (path: string) => void
}) {
  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1)
  const status = entry.change_status ? STATUS_META[entry.change_status] : null
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      aria-current={selected ? "true" : undefined}
      style={{ paddingLeft: 9 + depth * 12 }}
      className={`flex h-[31px] w-full shrink-0 items-center gap-2 rounded-ctrl pr-2 text-left text-[12.5px] ${
        selected
          ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
          : "text-text hover:bg-soft"
      }`}
    >
      <span className={`w-[10px] shrink-0 text-center font-mono text-[10.5px] font-bold ${status?.className ?? "text-faint"}`} title={status?.title}>
        {status?.letter ?? ""}
      </span>
      <FileIcon name={name} size={13} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {isDiff && (entry.added !== null || entry.deleted !== null) && (
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
          <span className="text-approve">+{entry.added ?? 0}</span>{" "}
          <span className="text-request">−{entry.deleted ?? 0}</span>
        </span>
      )}
      {entry.approved && <Circle size={7} className="shrink-0 fill-approve text-approve" aria-hidden />}
    </button>
  )
}

type Content =
  | { kind: "loading" }
  | { kind: "text"; lines: string[]; tokens: ThemedToken[][] | null }
  | { kind: "unsupported"; mime: string }
  | { kind: "error"; message: string }

function Editor({
  reviewId,
  entry,
  comments,
  fileProxy,
  commentsProxy,
  onOpenFiles,
}: {
  reviewId: string
  entry: FileEntry | null
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  onOpenFiles: () => void
}) {
  const dir = entry ? entry.path.slice(0, entry.path.lastIndexOf("/") + 1) : ""
  const name = entry ? entry.path.slice(entry.path.lastIndexOf("/") + 1) : ""
  const [content, setContent] = useState<Content>({ kind: "loading" })
  const [toc, setToc] = useState<OutlineItem[]>([])

  useEffect(() => {
    if (!entry) return
    const path = entry.path
    let cancelled = false
    setContent({ kind: "loading" })
    setToc([])
    fetch(`/api/review/${reviewId}/files/content?path=${encodeURIComponent(path)}`)
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          setContent({ kind: "error", message: `Couldn't load file (${response.status}).` })
          return
        }
        const mime = response.headers.get("content-type") ?? ""
        if (!isTextMime(mime)) {
          setContent({ kind: "unsupported", mime: mime.split(";")[0] || "binary" })
          return
        }
        const body = (await response.text()).replace(/\n$/, "")
        if (cancelled) return
        setContent({ kind: "text", lines: body.split("\n"), tokens: null })
        const ext = path.slice(path.lastIndexOf(".") + 1)
        highlightLines(body, ext)
          .then((tokens) => {
            if (!cancelled) setContent({ kind: "text", lines: body.split("\n"), tokens })
          })
          .catch(() => undefined)
        const lang = langForPath(path)
        if (lang) {
          outline(body, lang)
            .then((items) => {
              if (!cancelled) setToc(items)
            })
            .catch(() => undefined)
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) setContent({ kind: "error", message: cause.message })
      })
    return () => {
      cancelled = true
    }
  }, [reviewId, entry])

  const scrollToLine = (line: number) => {
    document
      .querySelector(`[data-review-line="${line}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-editor">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-4">
        <button
          type="button"
          onClick={onOpenFiles}
          className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink lg:hidden"
          title="Files"
          aria-label="Open file list"
        >
          <PanelLeft size={17} aria-hidden />
        </button>
        {entry ? (
          <>
            <FileIcon name={name} size={14} />
            <span className="truncate font-mono text-[12.5px] text-ink">
              <span className="text-faint">{dir}</span>
              {name}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">No file selected</span>
        )}
        <span className="flex-1" />
        {toc.length > 0 && <TocMenu items={toc} onJump={scrollToLine} />}
      </div>
      {!entry ? (
        <div className="grid flex-1 place-items-center text-[13px] text-faint">Select a file to review.</div>
      ) : content.kind === "loading" ? (
        <div className="grid flex-1 place-items-center text-[13px] text-faint">Loading…</div>
      ) : content.kind === "error" ? (
        <div className="grid flex-1 place-items-center text-[13px] text-request">{content.message}</div>
      ) : content.kind === "unsupported" ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[13px] text-faint">
          Can't render {content.mime} here yet.
        </div>
      ) : (
        <Source
          lines={content.lines}
          tokens={content.tokens}
          comments={comments}
          fileProxy={fileProxy}
          commentsProxy={commentsProxy}
          draftScope={`${reviewId}:${entry.path}`}
        />
      )}
    </div>
  )
}

const MONO_PX: Record<MonoSize, string> = { small: "11.5px", default: "12.5px", large: "14px" }

// Source files with an unknown extension are served as octet-stream, so treat
// that (and svg) as text; only a real media type (image/*, font, pdf, …) is a
// genuine non-text file the source view can't show.
function isTextMime(mime: string): boolean {
  const type = mime.split(";")[0].trim()
  if (type === "" || type === "application/octet-stream" || type === "image/svg+xml") return true
  if (type.startsWith("text/")) return true
  return /^application\/(json|javascript|xml|x-yaml|yaml|toml|x-sh|x-httpd-php|graphql|sql)$/.test(type)
}

const Source = observer(function Source({
  lines,
  tokens,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
}: {
  lines: string[]
  tokens: ThemedToken[][] | null
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
}) {
  const rows = tokens ?? lines.map((line) => [{ content: line, color: "" } as ThemedToken])
  const count = rows.length
  const gutter = String(count).length
  const wrap = uiStore.codeWrap

  // `add_comment` lives on the FileStore. The proxy is null only in the brief
  // window before the file's child store mounts, and every dispatch is guarded,
  // so the cast keeps the hook unconditional (Rules of Hooks).
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")

  // Line-anchored threads bucket by their anchor's *end* line (card past the
  // range); `anchoredLines` carries the full span so a multi-line range
  // highlights whole. Pending comments (the author's own unsent drafts) render
  // alongside published ones so they can be seen and edited before submit.
  const { threadsByLine, anchoredLines } = useMemo(() => {
    const map = new Map<number, Comment[]>()
    const spanned = new Set<number>()
    const last = count || 1
    for (const comment of comments) {
      if (comment.scope !== "located" || comment.anchor?.type !== "line_range") continue
      const start = Math.min(Math.max(comment.anchor.start_line, 1), last)
      const end = Math.min(Math.max(comment.anchor.end_line, start), last)
      for (let line = start; line <= end; line++) spanned.add(line)
      const bucket = map.get(end)
      if (bucket) bucket.push(comment)
      else map.set(end, [comment])
    }
    return { threadsByLine: map, anchoredLines: spanned }
  }, [comments, count])

  // The line range whose new-comment composer is open (null = none). `drag` is
  // the live gutter drag in progress; on release it commits to `draft`, which
  // renders the composer past the range's end line. A plain click is a
  // zero-length drag (down and up on one line); shift-click extends `draft`.
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)

  // Commit the drag on pointer release anywhere (the pointer may leave the
  // gutter before lifting). Re-armed each time the range grows; cheap for the
  // line counts a review file holds.
  useEffect(() => {
    if (!drag) return
    const commit = () => {
      setDraft({ start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) })
      setDrag(null)
    }
    window.addEventListener("pointerup", commit)
    return () => window.removeEventListener("pointerup", commit)
  }, [drag])

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
    setDraft(null)
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto py-1 font-mono leading-[1.55]"
      style={{ fontSize: MONO_PX[uiStore.monoSize] }}
    >
      {rows.map((lineTokens, index) => {
        const lineNo = index + 1
        const threads = threadsByLine.get(lineNo)
        const anchored = anchoredLines.has(lineNo)
        const active = drag ? { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) } : draft
        const selecting = active && lineNo >= active.start && lineNo <= active.end
        return (
          <Fragment key={index}>
            <div
              data-review-line={lineNo}
              className={`flex scroll-mt-2 ${anchored || selecting ? "bg-accent-soft" : "hover:bg-soft/40"}`}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  if (event.shiftKey && draft) {
                    setDraft({ start: Math.min(draft.start, lineNo), end: Math.max(draft.start, lineNo) })
                  } else {
                    setDraft(null)
                    setDrag({ from: lineNo, to: lineNo })
                  }
                }}
                onPointerEnter={() => setDrag((d) => (d ? { ...d, to: lineNo } : d))}
                style={{ minWidth: `${gutter + 2}ch`, touchAction: "none" }}
                title="Comment on this line — drag or shift-click for a range"
                className={`group/gut sticky left-0 shrink-0 cursor-pointer select-none px-3 text-right tabular-nums ${
                  anchored || selecting
                    ? "bg-accent-soft font-semibold text-accent-bright"
                    : "bg-editor text-faint hover:text-accent-bright"
                }`}
              >
                <span className="group-hover/gut:opacity-0">{lineNo}</span>
                <Plus
                  size={12}
                  aria-hidden
                  className="absolute inset-y-0 right-2.5 my-auto hidden group-hover/gut:block"
                />
              </button>
              <code className={`pr-6 text-text ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>
                {lineTokens.length === 0 ? (
                  " "
                ) : (
                  lineTokens.map((token, ti) => (
                    <span key={ti} style={token.color ? { color: token.color } : undefined}>
                      {token.content}
                    </span>
                  ))
                )}
              </code>
            </div>
            {draft && draft.end === lineNo && (
              <Composer
                anchorLabel={`line ${draft.start}${draft.end > draft.start ? `–${draft.end}` : ""}`}
                draftKey={`suikou-draft:${draftScope}:${draft.start}-${draft.end}`}
                pending={addComment.isPending}
                onSubmit={submitNew}
                onCancel={() => setDraft(null)}
              />
            )}
            {threads?.map((comment) => (
              <Thread key={comment.id} comment={comment} commentsProxy={commentsProxy} />
            ))}
          </Fragment>
        )
      })}
    </div>
  )
})

const TYPE_META = {
  fix_required: { label: "FIX_REQUIRED", Icon: AlertTriangle, card: "bg-type-fix-soft ring-type-fix-edge", pill: "bg-type-fix-soft text-type-fix ring-type-fix-edge" },
  needs_answer: { label: "NEEDS_ANSWER", Icon: HelpCircle, card: "bg-type-ask-soft ring-type-ask-edge", pill: "bg-type-ask-soft text-type-ask ring-type-ask-edge" },
  note: { label: "NOTE", Icon: StickyNote, card: "bg-type-note-soft ring-type-note-edge", pill: "bg-type-note-soft text-muted ring-type-note-edge" },
} as const

// An inline comment thread below its anchored code line. Published comments are
// read-only with a Reply affordance; a pending comment (the author's own unsent
// draft) carries a Pending badge and Edit / Delete. Editing swaps the card for a
// prefilled composer.
function Thread({ comment, commentsProxy }: { comment: Comment; commentsProxy: CommentsStoreProxy | null }) {
  const meta = TYPE_META[comment.critique_type]
  const anchor = comment.anchor?.type === "line_range" ? comment.anchor : null
  const pending = comment.status === "pending"
  const bodyHtml = useMemo(() => renderMarkdown(comment.body), [comment.body])

  // Guarded casts: the CommentsStore proxy is null only until the child mounts,
  // and every dispatch below checks it first (Rules of Hooks keep the calls
  // unconditional).
  const editCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "edit_comment")
  const deleteCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "delete_comment")
  const replyCmd = useMusubiCommand(commentsProxy as CommentsStoreProxy, "reply")
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)

  const range = anchor
    ? `line ${anchor.start_line}${anchor.end_line > anchor.start_line ? `–${anchor.end_line}` : ""}`
    : "comment"

  if (editing) {
    return (
      <Composer
        anchorLabel={range}
        initialType={comment.critique_type}
        initialBody={comment.body}
        submitLabel="Save"
        pending={editCmd.isPending}
        onSubmit={(body, type) => {
          if (commentsProxy) editCmd.dispatch({ comment_id: comment.id, body, critique_type: type }).catch(() => undefined)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className={`my-1.5 ml-14 mr-3.5 overflow-hidden rounded-panel shadow-sm ring-1 ring-inset ${meta.card} ${
        comment.resolved ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className={`inline-flex h-[19px] items-center gap-1 rounded-full px-2 text-[10px] font-extrabold tracking-wide ring-1 ring-inset ${meta.pill}`}>
          <meta.Icon size={11} aria-hidden />
          {meta.label}
        </span>
        {anchor && (
          <span className="font-mono text-[11px] text-muted">
            on line {anchor.start_line}
            {anchor.end_line > anchor.start_line ? `–${anchor.end_line}` : ""}
            {pending ? "" : ` · Round ${comment.authored_round}`}
          </span>
        )}
        {comment.outdated && <span className="font-mono text-[11px] text-amber">· outdated</span>}
        <span className="flex-1" />
        {pending ? (
          <span className="inline-flex items-center rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber ring-1 ring-inset ring-amber-edge">
            PENDING
          </span>
        ) : comment.resolved ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-approve">
            <CircleCheck size={12} aria-hidden />
            Resolved
          </span>
        ) : null}
      </div>
      <div
        className="md-body px-3 pb-2.5 text-[12.5px] leading-[1.5] text-ink"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {comment.replies.length > 0 && (
        <div className="mx-3 mb-2.5 flex flex-col gap-2">
          {comment.replies.map((reply) => (
            <Reply key={reply.id} reply={reply} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-0.5 px-2.5 pb-2">
        {pending ? (
          <>
            <ThreadAction icon={Pencil} label="Edit" onClick={() => setEditing(true)} />
            <ThreadAction
              icon={Trash2}
              label="Delete"
              onClick={() => {
                if (commentsProxy) deleteCmd.dispatch({ comment_id: comment.id }).catch(() => undefined)
              }}
            />
          </>
        ) : (
          !replying && <ThreadAction icon={CornerDownRight} label="Reply" onClick={() => setReplying(true)} />
        )}
      </div>
      {replying && (
        <Composer
          anchorLabel={null}
          submitLabel="Reply"
          className="mx-2.5 mb-2.5"
          pending={replyCmd.isPending}
          onSubmit={(body) => {
            if (commentsProxy) replyCmd.dispatch({ comment_id: comment.id, body }).catch(() => undefined)
            setReplying(false)
          }}
          onCancel={() => setReplying(false)}
        />
      )}
    </div>
  )
}

function ThreadAction({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[26px] items-center gap-1.5 rounded-ctrl px-2 text-[11.5px] font-medium text-muted hover:bg-soft hover:text-ink"
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}

const TYPE_OPTIONS: { value: CritiqueType; label: string; Icon: typeof AlertTriangle; dot: string }[] = [
  { value: "fix_required", label: "Fix required", Icon: AlertTriangle, dot: "bg-type-fix" },
  { value: "needs_answer", label: "Needs answer", Icon: HelpCircle, dot: "bg-type-ask" },
  { value: "note", label: "Note", Icon: StickyNote, dot: "bg-type-note" },
]

// The compact inline composer: a header (anchor + type dropdown + close), a
// textarea, and Add/Cancel. Type lives in a header dropdown rather than a pill
// row to keep the card short. `anchorLabel: null` = reply mode (no type/anchor).
// A `draftKey` persists the in-progress body to localStorage (F6).
function Composer({
  anchorLabel,
  initialType = "fix_required",
  initialBody = "",
  draftKey,
  submitLabel = "Add",
  pending,
  className = "my-1.5 ml-14 mr-3.5",
  onSubmit,
  onCancel,
}: {
  anchorLabel: string | null
  initialType?: CritiqueType
  initialBody?: string
  draftKey?: string
  submitLabel?: string
  pending?: boolean
  className?: string
  onSubmit: (body: string, type: CritiqueType) => void
  onCancel: () => void
}) {
  const withType = anchorLabel !== null
  const [type, setType] = useState<CritiqueType>(initialType)
  const [body, setBody] = useState(() => (draftKey ? (localStorage.getItem(draftKey) ?? initialBody) : initialBody))
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useEffect(() => {
    if (!draftKey) return
    if (body.trim()) localStorage.setItem(draftKey, body)
    else localStorage.removeItem(draftKey)
  }, [body, draftKey])

  const submit = () => {
    const text = body.trim()
    if (!text) return
    if (draftKey) localStorage.removeItem(draftKey)
    onSubmit(text, type)
  }

  const current = TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0]

  return (
    <div className={`overflow-hidden rounded-panel border border-hair-strong bg-surface font-sans shadow-lg ${className}`}>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        {anchorLabel && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <CornerDownRight size={12} aria-hidden />
            {anchorLabel}
          </span>
        )}
        <span className="flex-1" />
        {withType && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-hair-strong bg-canvas px-2.5 text-[11px] font-semibold text-text hover:bg-soft"
                >
                  <span className={`size-2 rounded-full ${current.dot}`} aria-hidden />
                  {current.label}
                  <ChevronDown size={12} className="text-faint" aria-hidden />
                </button>
              }
            />
            <DropdownMenuContent>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} onClick={() => setType(option.value)}>
                  <span className={`size-2 shrink-0 rounded-full ${option.dot}`} aria-hidden />
                  <option.Icon size={13} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1">{option.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid size-6 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="px-3 pb-3">
        <textarea
          ref={areaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              onCancel()
            }
          }}
          rows={3}
          placeholder={withType ? "Leave a comment…" : "Write a reply…"}
          className="w-full resize-y rounded-ctrl border border-hair-strong bg-canvas px-2.5 py-2 text-[12.5px] leading-[1.5] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-[28px] rounded-ctrl px-3 text-[12px] font-medium text-muted hover:bg-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || pending}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-ctrl bg-accent px-3.5 text-[12px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
          >
            {submitLabel}
            <span className="text-[11px] opacity-80">⌘⏎</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Reply({ reply }: { reply: Comment["replies"][number] }) {
  const agent = reply.author === "agent"
  const bodyHtml = useMemo(() => renderMarkdown(reply.body), [reply.body])
  return (
    <div
      className={`rounded-ctrl px-3 py-2 ring-1 ring-inset ${
        agent ? "bg-accent-softer ring-accent-edge" : "bg-soft ring-hair-strong"
      }`}
    >
      <div className={`mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold ${agent ? "text-accent-bright" : "text-text"}`}>
        <span className={`grid size-[15px] place-items-center rounded-[5px] ${agent ? "bg-accent text-on-accent" : "bg-control text-muted"}`}>
          {agent ? <Bot size={10} aria-hidden /> : <User size={10} aria-hidden />}
        </span>
        {agent ? "agent" : "you"}
      </div>
      <div
        className="md-body text-[12px] leading-[1.5] text-text"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  )
}

function TocMenu({ items, onJump }: { items: OutlineItem[]; onJump: (line: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
            title="Outline"
          >
            <ListTree size={16} aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent>
        <div className="max-h-[60vh] w-[260px] overflow-auto">
          {items.map((item, index) => (
            <DropdownMenuItem key={`${item.line}-${index}`} onClick={() => onJump(item.line)}>
              <span
                style={{ paddingLeft: (item.level - 1) * 12 }}
                className="min-w-0 flex-1 truncate font-mono text-[12px]"
              >
                {item.text}
              </span>
              <span className="ml-2 shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{item.line}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Inspector({ entries }: { entries: FileEntry[] }) {
  const reviewed = entries.filter((e) => e.verdict !== null).length
  const approved = entries.filter((e) => e.approved).length
  return (
    <aside className="hidden min-h-0 flex-col border-l border-hair-strong bg-surface p-4 lg:flex">
      <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Review overview</h3>
      <dl className="mt-3 flex flex-col gap-2 text-[12px]">
        <Stat label="Files" value={`${entries.length}`} />
        <Stat label="Reviewed" value={`${reviewed}/${entries.length}`} />
        <Stat label="Approved" value={`${approved}`} />
      </dl>
      <p className="mt-4 text-[11.5px] leading-[1.5] text-faint">
        Comments, verdicts, and the submit panel arrive in the next pass.
      </p>
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular-nums text-ink">{value}</dd>
    </div>
  )
}

function StatusBar({ path, connected }: { path: string | null; connected: boolean }) {
  return (
    <div className="flex h-[29px] shrink-0 items-center gap-2 border-t border-hair-strong bg-surface px-3 text-[11px] text-muted">
      <span className="truncate font-mono text-faint">{path ?? ""}</span>
      <span className="flex-1" />
      <span className={`size-[7px] rounded-full ${connected ? "bg-approve" : "bg-amber"}`} aria-hidden />
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-[13px] text-muted">{children}</div>
  )
}
