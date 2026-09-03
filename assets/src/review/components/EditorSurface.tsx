import { useEffect, useRef, useState } from "react"
import type { ThemedToken } from "shiki"
import { AlertTriangle, Binary, File, ListTree, Loader2 } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { langForPath, outline, type OutlineItem } from "../../treesitter/outline"
import { highlightLines } from "../highlight"
import { markdownToc } from "../markdown"
export { HtmlView } from "./HtmlSurface"

export type Content =
  | { kind: "loading" }
  | { kind: "text"; lines: string[]; tokens: ThemedToken[][] | null }
  | { kind: "image"; url: string; mime: string; bytes: number | null }
  | { kind: "binary"; mime: string; bytes: number | null }
  | { kind: "error"; message: string; status: number | null }

/** Live-lens overlay for a diff review's file-content fetch (BDR-0025).
 * `scope` and `worktree` are per-request query params; the backend
 * re-interprets them against live git. Missing keys keep the branch-range
 * diff. `commits` is stored newest-first, matching `/commits` order. */
export type DiffLens = {
  scope?: "all" | { commits: string[] }
  worktree?: "diff" | "staged" | "unstaged"
}

/** Fetch a review file's bytes and classify them into a render `Content`: text
 * (with async Shiki tokens and a table-of-contents outline), image, binary, or
 * an error. Re-runs when the review, path, or lens changes; `null` path stays
 * loading. Shared by the single-file editor and the stacked all-files view. */
// Per-URL cache of the last successful `{content, toc}` payload. Keeps the
// previously-rendered file visible while a refetch (lens change, path swap)
// runs against the backend, so switching files or scope never flashes the
// loading state. Cache is intentionally module-scoped and never invalidated —
// the backend's live re-read gives the newer bytes when they arrive, and the
// hook's effect always writes-through so subsequent renders converge.
const FILE_CONTENT_CACHE = new Map<string, { content: Content; toc: OutlineItem[] }>()

export function useFileContent(
  reviewId: string,
  path: string | null,
  lens?: DiffLens,
  // Bump to force a fresh fetch of the same URL (a reload after the file changed
  // on disk). The effect always fetches and writes through, so re-running it is
  // the whole invalidation — the fresh bytes overwrite the cached entry.
  reloadNonce = 0,
): { content: Content; toc: OutlineItem[] } {
  const lensKey = lensQueryString(lens)
  const url = path ? fileContentUrl(reviewId, path, lensKey) : ""
  const cached = url ? FILE_CONTENT_CACHE.get(url) : undefined
  const [content, setContent] = useState<Content>(cached?.content ?? { kind: "loading" })
  const [toc, setToc] = useState<OutlineItem[]>(cached?.toc ?? [])

  useEffect(() => {
    if (!path) return
    let cancelled = false
    const hit = FILE_CONTENT_CACHE.get(url)
    if (hit) {
      // Keep the last-known payload on screen while we revalidate. No flash.
      setContent(hit.content)
      setToc(hit.toc)
    } else {
      setContent({ kind: "loading" })
      setToc([])
    }
    let finalContent: Content | null = null
    let finalToc: OutlineItem[] = hit?.toc ?? []
    const record = (next: Content) => {
      finalContent = next
      FILE_CONTENT_CACHE.set(url, { content: next, toc: finalToc })
    }
    const recordToc = (items: OutlineItem[]) => {
      finalToc = items
      if (finalContent) FILE_CONTENT_CACHE.set(url, { content: finalContent, toc: items })
    }
    fetch(url)
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          // A 404 here is almost always a file that has gone away — deleted from
          // the checkout mid-review, or a checkout that no longer exists at all.
          // Say so, rather than making the reader decode a status code.
          const message =
            response.status === 404
              ? "File not found — it may have been deleted, or its checkout is gone."
              : `Couldn't load file (${response.status}).`
          const next: Content = { kind: "error", message, status: response.status }
          setContent(next)
          record(next)
          return
        }
        const mime = response.headers.get("content-type") ?? ""
        if (!isTextMime(mime)) {
          const type = mime.split(";")[0].trim() || "application/octet-stream"
          const bytes = Number(response.headers.get("content-length")) || null
          const next: Content =
            type.startsWith("image/")
              ? { kind: "image", url, mime: type, bytes }
              : { kind: "binary", mime: type, bytes }
          setContent(next)
          record(next)
          return
        }
        const body = (await response.text()).replace(/\n$/, "")
        if (cancelled) return
        const initial: Content = { kind: "text", lines: body.split("\n"), tokens: null }
        setContent(initial)
        record(initial)
        const ext = path.slice(path.lastIndexOf(".") + 1)
        highlightLines(body, ext)
          .then((tokens) => {
            if (cancelled) return
            const withTokens: Content = { kind: "text", lines: body.split("\n"), tokens }
            setContent(withTokens)
            record(withTokens)
          })
          .catch(() => undefined)
        if (/\.(md|markdown)$/i.test(path)) {
          if (!cancelled) {
            const items = markdownToc(body)
            setToc(items)
            recordToc(items)
          }
        } else {
          const lang = langForPath(path)
          if (lang) {
            outline(body, lang)
              .then((items) => {
                if (cancelled) return
                setToc(items)
                recordToc(items)
              })
              .catch(() => undefined)
          }
        }
      })
      .catch((cause: Error) => {
        if (cancelled) return
        const next: Content = { kind: "error", message: cause.message, status: null }
        setContent(next)
        record(next)
      })
    return () => {
      cancelled = true
    }
  }, [reviewId, path, lensKey, url, reloadNonce])

  return { content, toc }
}

/** Warm the file-content cache for a whole review so switching files is
 * instant. Fetches each not-yet-cached file's bytes (in the given order, a few
 * at a time so it never starves the file the reader is actually looking at) and
 * stores the same `{kind:"text"}` payload `useFileContent` writes — tokens and
 * outline stay lazy, computed on first render. Returns an abort function; call
 * it when the review or lens changes. Failures are skipped, not cached, so the
 * on-demand fetch still surfaces a real error if the reader opens that file. */
export function prefetchReviewFiles(reviewId: string, paths: string[], lens?: DiffLens): () => void {
  const lensKey = lensQueryString(lens)
  const controller = new AbortController()
  const queue = paths
    .map((path) => ({ path, url: fileContentUrl(reviewId, path, lensKey) }))
    .filter(({ url }) => !FILE_CONTENT_CACHE.has(url))

  const worker = async () => {
    while (!controller.signal.aborted) {
      const item = queue.shift()
      if (!item) return
      if (FILE_CONTENT_CACHE.has(item.url)) continue
      try {
        const response = await fetch(item.url, { signal: controller.signal })
        if (!response.ok) continue
        const mime = response.headers.get("content-type") ?? ""
        if (!isTextMime(mime)) {
          const type = mime.split(";")[0].trim() || "application/octet-stream"
          const bytes = Number(response.headers.get("content-length")) || null
          await response.body?.cancel()
          const next: Content = type.startsWith("image/")
            ? { kind: "image", url: item.url, mime: type, bytes }
            : { kind: "binary", mime: type, bytes }
          FILE_CONTENT_CACHE.set(item.url, { content: next, toc: [] })
          continue
        }
        const body = (await response.text()).replace(/\n$/, "")
        FILE_CONTENT_CACHE.set(item.url, {
          content: { kind: "text", lines: body.split("\n"), tokens: null },
          toc: [],
        })
      } catch {
        // Aborted or network error — leave uncached for the on-demand fetch.
      }
    }
  }

  const CONCURRENCY = 4
  for (let i = 0; i < CONCURRENCY; i++) void worker()
  return () => controller.abort()
}

/** Build the file-content URL with an optional lens query string appended.
 * A default lens (undefined or empty) leaves the URL exactly matching the
 * pre-BDR-0024 shape so cache keys and ETags stay stable. */
function fileContentUrl(reviewId: string, path: string, lensQuery: string): string {
  const base = `/api/review/${reviewId}/files/content?path=${encodeURIComponent(path)}`
  return lensQuery ? `${base}&${lensQuery}` : base
}

function lensQueryString(lens: DiffLens | undefined): string {
  if (!lens) return ""
  const parts: string[] = []
  if (lens.scope && lens.scope !== "all" && lens.scope.commits.length > 0) {
    parts.push(`scope=commits:${lens.scope.commits.map(encodeURIComponent).join(",")}`)
  }
  if (lens.worktree && lens.worktree !== "diff") {
    parts.push(`worktree=${lens.worktree}`)
  }
  return parts.join("&")
}

export function TocMenu({ items, onJump }: { items: OutlineItem[]; onJump: (line: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="grid size-[30px] shrink-0 place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
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
                className="min-w-0 flex-1 truncate font-mono text-xs"
              >
                {item.text}
              </span>
              <span className="ml-2 shrink-0 font-mono text-2xs tabular-nums text-faint">{item.line}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Floor at 20%: below that the responsive preview simulates a >5x-wide viewport
// whose full-frame layer OOM-crashes the iOS WebKit tile budget.
export const clampZoom = (zoom: number): number => Math.min(2, Math.max(0.2, Math.round(zoom * 10) / 10))

const DOC_VIEW_KEY = "suikou-doc-view"

/** The reader's remembered choice between the raw Source and the rendered view,
 * shared across renderable files (markdown Preview, html Comment) and both the
 * single-file and stacked all-files editors, so the choice carries and survives
 * a reload. */
export function readDocView(): "source" | "rendered" {
  return localStorage.getItem(DOC_VIEW_KEY) === "source" ? "source" : "rendered"
}

export function writeDocView(value: "source" | "rendered"): void {
  localStorage.setItem(DOC_VIEW_KEY, value)
}

function isTextMime(mime: string): boolean {
  const type = mime.split(";")[0].trim()
  if (type === "" || type === "application/octet-stream" || type === "image/svg+xml") return true
  if (type.startsWith("text/")) return true
  return /^application\/(json|javascript|xml|x-yaml|yaml|toml|x-sh|x-httpd-php|graphql|sql)$/.test(type)
}

const MAX_IMAGE_ZOOM = 8
const clampImageZoom = (zoom: number): number => Math.min(MAX_IMAGE_ZOOM, Math.max(1, zoom))

/** Frameless image viewer: the artifact fills the canvas (object-contain) with
 * no border, and a metadata strip (name, dimensions, size, format) sits below
 * it. Zoom with Shift+wheel (or a trackpad pinch) on desktop and a two-finger
 * pinch on touch; drag to pan once zoomed; double-click or double-tap resets to
 * fit. Pan is clamped to the scaled image's own bounds so it can't be flung
 * into empty canvas. */
export function ImageView({ name, url, mime, bytes }: { name: string; url: string; mime: string; bytes: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const dimsRef = useRef<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  zoomRef.current = zoom
  offsetRef.current = offset

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; mid: { x: number; y: number }; offset: { x: number; y: number } } | null>(null)
  const panLast = useRef<{ x: number; y: number } | null>(null)

  // Overflow of the fitted (object-contain) image beyond the container at a
  // given zoom, halved — the furthest the image center may travel each axis.
  const clampOffset = (next: { x: number; y: number }, atZoom: number) => {
    const el = containerRef.current
    const nat = dimsRef.current
    if (!el || !nat) return next
    const cw = el.clientWidth
    const ch = el.clientHeight
    const fit = Math.min(cw / nat.w, ch / nat.h)
    const fw = nat.w * fit
    const fh = nat.h * fit
    const maxX = Math.max(0, (fw * atZoom - cw) / 2)
    const maxY = Math.max(0, (fh * atZoom - ch) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) }
  }

  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  // Zoom toward a container-center-relative point, keeping it visually pinned.
  const zoomAround = (nextZoom: number, px: number, py: number, from: { zoom: number; offset: { x: number; y: number } }) => {
    const nz = clampImageZoom(nextZoom)
    const nextOffset = clampOffset(
      { x: px - (px - from.offset.x) * (nz / from.zoom), y: py - (py - from.offset.y) * (nz / from.zoom) },
      nz,
    )
    setZoom(nz)
    setOffset(nextOffset)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      // Plain wheel scrolls the surrounding editor; Shift (or a trackpad pinch,
      // which browsers deliver as ctrl+wheel) zooms the image in place.
      if (!event.shiftKey && !event.ctrlKey) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      zoomAround(zoomRef.current * Math.exp(-event.deltaY * 0.0015), px, py, {
        zoom: zoomRef.current,
        offset: offsetRef.current,
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const relCenter = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    containerRef.current?.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: zoomRef.current,
        mid: relCenter((a.x + b.x) / 2, (a.y + b.y) / 2),
        offset: offsetRef.current,
      }
      panLast.current = null
    } else if (pointers.current.size === 1) {
      panLast.current = { x: event.clientX, y: event.clientY }
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAround((pinch.current.zoom * dist) / pinch.current.dist, pinch.current.mid.x, pinch.current.mid.y, {
        zoom: pinch.current.zoom,
        offset: pinch.current.offset,
      })
    } else if (pointers.current.size === 1 && panLast.current && zoomRef.current > 1) {
      const dx = event.clientX - panLast.current.x
      const dy = event.clientY - panLast.current.y
      panLast.current = { x: event.clientX, y: event.clientY }
      setOffset((current) => clampOffset({ x: current.x + dx, y: current.y + dy }, zoomRef.current))
    }
  }

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()]
      panLast.current = { x: only.x, y: only.y }
    } else if (pointers.current.size === 0) {
      panLast.current = null
    }
  }

  const format = mime.split("/")[1]?.split("+")[0]?.toUpperCase() ?? "IMAGE"
  const meta = [name, dims && `${dims.w}×${dims.h}`, bytes && formatBytes(bytes), format].filter(Boolean).join(" · ")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        style={{ touchAction: "none" }}
        className={`grid min-h-0 flex-1 place-items-center overflow-hidden p-6 [background:repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg-1)_0%_50%)_50%/18px_18px] ${
          zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <figure className="flex max-h-full max-w-full min-h-0 flex-col items-center gap-1.5">
          <img
            src={url}
            alt={name}
            draggable={false}
            onLoad={(event) => {
              const next = { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight }
              dimsRef.current = next
              setDims(next)
            }}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            className="block min-h-0 max-h-[calc(100%-1.5rem)] max-w-full select-none [transform-origin:center]"
          />
          {meta && <figcaption className="max-w-full truncate font-mono text-xs text-muted">{meta}</figcaption>}
        </figure>
      </div>
    </div>
  )
}

export function BinaryNotice({ name, mime, bytes }: { name: string; mime: string; bytes: number | null }) {
  const meta = [name, bytes && formatBytes(bytes), mime].filter(Boolean).join(" · ")

  return (
    <FileNotice
      icon={Binary}
      title="Cannot render this file"
      body="This is a binary artifact. There is no text or visual representation to show, and no place to anchor a comment."
      meta={meta}
    />
  )
}

/** A tall placeholder shown while a file's content is still loading. Sized like
 * the empty/binary notices so a file that hasn't loaded yet reserves a screen's
 * worth of height — in the stacked view this keeps only a few files per screen,
 * so fewer heavy bodies mount at once on first paint. */
export function LoadingNotice({ name }: { name: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-[13px] px-8 py-12 text-center">
      <div className="grid size-[54px] place-items-center rounded-[16px] border border-hair-strong bg-soft text-muted shadow-[inset_0_0.5px_0_var(--edge-top-2)]">
        <Loader2 size={24} className="animate-spin" aria-hidden />
      </div>
      <p className="max-w-[40ch] text-xs leading-[1.5] text-muted">Loading {name}…</p>
    </div>
  )
}

export function EmptyFileNotice({ name }: { name: string }) {
  return (
    <FileNotice
      icon={File}
      title="This file is empty"
      body="There's nothing to show or comment on in this file yet."
      meta={name}
    />
  )
}

/** Error-state notice for a file fetch. A diff review's 404 is the "no
 * changes under the current source lens" case (BDR-0025) and gets its own
 * amber guidance; every other failure (500, network, non-diff 404) is a
 * genuine load error, so the raw message shows instead of the misleading
 * "switch scope" hint. */
export function FileErrorNotice({
  isDiff,
  content,
  meta,
}: {
  isDiff: boolean
  content: Extract<Content, { kind: "error" }>
  meta: string
}) {
  if (isDiff && content.status === 404) {
    return (
      <FileNotice
        icon={AlertTriangle}
        title="Diff unavailable"
        body="This file has no changes under the current source lens. Switch to a wider scope, or pick a different file."
        tone="amber"
        meta={meta}
      />
    )
  }
  return <FileNotice icon={AlertTriangle} title="Can't load this file" body={content.message} tone="request" meta={meta} />
}

/** Shared empty-state / notice layout: circular icon badge, heading, body,
 * optional pill-shaped meta, and optional action row (buttons / links).
 * Reused by binary/empty/HTML/loading/error notices so every "not the
 * content you asked for" surface looks the same. */
export function FileNotice({
  icon: Icon,
  title,
  body,
  meta,
  action,
  tone = "default",
  spin = false,
}: {
  icon: typeof Binary
  title: React.ReactNode
  body?: React.ReactNode
  meta?: string
  action?: React.ReactNode
  tone?: "default" | "amber" | "request"
  spin?: boolean
}) {
  const badge =
    tone === "amber"
      ? "border-amber-edge bg-amber-soft text-amber"
      : tone === "request"
        ? "border-request-edge bg-request-soft text-request"
        : "border-hair-strong bg-soft text-muted"
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[13px] px-8 py-12 text-center">
      <div className={`grid size-[54px] place-items-center rounded-[16px] border shadow-[inset_0_0.5px_0_var(--edge-top-2)] ${badge}`}>
        <Icon size={26} className={spin ? "animate-spin" : undefined} aria-hidden />
      </div>
      <h3 className="text-base font-[680] text-ink">{title}</h3>
      {body && <p className="max-w-[40ch] text-xs leading-[1.5] text-muted">{body}</p>}
      {meta && <div className="rounded-full bg-control px-[11px] py-1 font-mono text-xs text-faint">{meta}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
