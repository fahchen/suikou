import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { observer } from "mobx-react-lite"
import { AnimatePresence, motion } from "motion/react"
import { FileText, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react"

import { CommentCard } from "../CommentCard"
import { Editor } from "../Editor"
import { useSetHeaderControls } from "../header-slot"
import { isOutdated, locate, selectorFor } from "../element-selector"
import { assetBase } from "../urls"
import { uiStore } from "../../stores/ui-store"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import type { Comment } from "../types"
import type { ViewProps } from "./registry"
import { HtmlAnchorComposer, type HtmlAnchorTarget } from "./HtmlAnchorComposer"

const COMMENT_HIGHLIGHT_CLASS = "suikou-anchor-highlight"
const HOVER_HIGHLIGHT_CLASS = "suikou-hover-highlight"
const TARGET_HIGHLIGHT_CLASS = "suikou-target-highlight"

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100))
}

// The iframe can't inherit the parent's CSS custom properties, so resolve the
// active theme's accent here and template it into the injected stylesheet. Read
// on every (re)apply so a theme switch repaints the highlights to match.
function highlightStyle(): string {
  const root = getComputedStyle(document.documentElement)
  const blue = root.getPropertyValue("--blue").trim() || "#2563eb"
  const focus = root.getPropertyValue("--focus").trim() || blue
  const tint = (color: string, pct: number) =>
    `color-mix(in oklch, ${color} ${pct}%, transparent)`
  return `
::selection{background:${tint(blue, 28)};}
.${COMMENT_HIGHLIGHT_CLASS}{outline:1.5px dashed ${blue};outline-offset:2px;background:${tint(blue, 6)};cursor:pointer;}
.${HOVER_HIGHLIGHT_CLASS}{outline:1.5px solid ${blue};outline-offset:2px;background:${tint(blue, 7)};cursor:pointer;transition:outline-color 140ms cubic-bezier(0.22,1,0.36,1),outline-width 140ms cubic-bezier(0.22,1,0.36,1),background 140ms cubic-bezier(0.22,1,0.36,1);}
.${TARGET_HIGHLIGHT_CLASS}{outline:2px solid ${focus};outline-offset:3px;background:${tint(focus, 12)};cursor:pointer;}
@media (prefers-reduced-motion: reduce){.${HOVER_HIGHLIGHT_CLASS}{transition:none;}}
`
}

/**
 * Dispatcher that picks the source or interactive sub-view. Kept as a thin
 * branchy wrapper with NO hooks of its own so flipping `forceSource` between
 * renders doesn't change the parent's hook count.
 */
export const HtmlView = observer(function HtmlView(props: ViewProps) {
  const { view, forceSource, inline, nested } = props
  if (forceSource) {
    return (
      <Editor
        view="source"
        content={view.content}
        contentError={view.contentError}
        blocks={view.blocks}
        loading={view.loading}
        comments={view.comments}
        rawLines={view.rawLines}
        inline={inline}
        nested={nested}
      />
    )
  }
  return <HtmlInteractiveView view={view} inline={inline} nested={nested} />
})

/**
 * Interactive iframe sub-view. ALL hooks are declared above any early returns
 * so the hook count is identical across renders (loading→loaded, error→ok).
 * A prior layout where `matchingComments`'s `useMemo` lived below `if
 * (loading)` reliably crashed with "rendered more hooks than during the
 * previous render" on the first navigation into a single-file HTML route.
 */
const HtmlInteractiveView = observer(function HtmlInteractiveView(props: {
  view: ViewProps["view"]
  inline: boolean
  nested?: boolean
}) {
  const { view, inline, nested } = props
  const { snapshot, content, contentError, loading, comments } = view
  const artifactId = snapshot.artifact.id

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [docVersion, setDocVersion] = useState(0)
  const [target, setTarget] = useState<HtmlAnchorTarget | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const setHeaderControls = useSetHeaderControls()

  // Single-file route (the only place a header slot exists): push the
  // zoom/fullscreen controls up into the file card header so the iframe fills
  // the card edge to edge. The fullscreen overlay covers the header, so it keeps
  // its own controls; all-files stacked cards and standalone renders (tests)
  // have no slot and keep the controls inline in the paper frame.
  const headerControls = setHeaderControls !== null && !fullscreen
  useEffect(() => {
    if (!setHeaderControls || !headerControls) return
    setHeaderControls(
      <HtmlToolbar zoom={zoom} fullscreen={fullscreen} setZoom={setZoom} setFullscreen={setFullscreen} />
    )
    return () => setHeaderControls(null)
  }, [setHeaderControls, headerControls, zoom, fullscreen])

  const srcdoc = useMemo(
    () => composeSrcdoc(content, assetBase(artifactId)),
    [content, artifactId]
  )

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    applyHighlightStyle(doc)
    setDocVersion((v) => v + 1)
  }, [])

  // Repaint the injected highlight stylesheet when the theme changes so the
  // accent tracks the active palette (the iframe can't see parent CSS vars).
  useEffect(() => {
    if (docVersion === 0) return
    const doc = iframeRef.current?.contentDocument
    if (doc) applyHighlightStyle(doc)
  }, [docVersion, uiStore.theme])

  // Scale the rendered document on the iframe's root element. Prefer CSS `zoom`
  // where supported (Chromium/Safari): it keeps element bounding rects in sync
  // with the iframe's own rect so the anchor-popover positioning math stays
  // correct. Firefox doesn't support `zoom`, so fall back to `transform: scale`
  // with a top-left origin; transforms also scale child bounding rects, so the
  // anchor math holds, and widening the root to `100%/z` keeps the scaled layout
  // filling (and scrollable) instead of clipping to the unscaled box. Reapply on
  // doc (re)load so a fresh srcdoc keeps the level.
  useEffect(() => {
    const root = iframeRef.current?.contentDocument?.documentElement
    if (!root) return
    const supportsZoom =
      typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "2")
    if (supportsZoom) {
      root.style.removeProperty("transform")
      root.style.removeProperty("transform-origin")
      root.style.removeProperty("width")
      root.style.setProperty("zoom", String(zoom))
      return
    }
    root.style.removeProperty("zoom")
    root.style.transformOrigin = "top left"
    root.style.transform = `scale(${zoom})`
    root.style.width = `${100 / zoom}%`
  }, [zoom, docVersion])

  // Lock body scroll while the fullscreen overlay covers the app.
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [fullscreen])

  // Escape exits fullscreen (the overlay is our own CSS, not the native API).
  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  const elementComments = useMemo(
    () => comments.filter((c) => c.anchor?.type === "element"),
    [comments]
  )

  // Hover + click + (legacy) selection wiring. Pointer events drive the live
  // hover outline; click sets the targeted anchor; mouseup with a non-empty
  // selection still opens the composer scoped to the selected element so the
  // selection-to-quote affordance keeps working.
  useEffect(() => {
    // Interactive mode: leave the document's own pointer handling alone so the
    // scripted page (buttons, links) works instead of anchoring comments.
    if (uiStore.htmlInteractive) return
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!iframe || !doc) return

    function isAnchorable(el: Element | null): el is Element {
      if (!el) return false
      const tag = el.tagName
      return tag !== "HTML" && tag !== "BODY" && tag !== "HEAD"
    }

    function clearHover(): void {
      for (const el of Array.from(doc!.querySelectorAll(`.${HOVER_HIGHLIGHT_CLASS}`))) {
        el.classList.remove(HOVER_HIGHLIGHT_CLASS)
      }
    }

    function paintHover(el: Element | null): void {
      clearHover()
      if (el) el.classList.add(HOVER_HIGHLIGHT_CLASS)
    }

    function onMove(e: Event): void {
      const el = (e as PointerEvent).target as Element | null
      if (!isAnchorable(el)) {
        paintHover(null)
        return
      }
      paintHover(el)
    }

    function onLeave(): void {
      paintHover(null)
    }

    function buildTarget(el: Element, quote: string): HtmlAnchorTarget {
      return { artifactId, selector: selectorFor(el), quote }
    }

    function cap(text: string): string {
      return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text
    }

    // First non-empty text leaf in DOM order, not the whole subtree — keeps the
    // quote short and stable so `isOutdated` checks the element's leading text
    // rather than volatile descendant content (e.g. a live counter).
    function quoteFor(el: Element): string {
      const walker = doc!.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const t = (node.textContent ?? "").replace(/\s+/g, " ").trim()
        if (t !== "") return cap(t)
        node = walker.nextNode()
      }
      return ""
    }

    function onMouseUp(): void {
      // Read selection after the browser has finalized the range.
      queueMicrotask(() => {
        const sel = doc!.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
        const range = sel.getRangeAt(0)
        const el = elementForRange(range)
        if (!isAnchorable(el) || !doc!.body.contains(el)) return
        const quote = cap(sel.toString().trim())
        if (quote === "") return
        setTarget(buildTarget(el, quote))
      })
    }

    // Touch text-selection finalizes via selectionchange, not mouseup.
    let timer: ReturnType<typeof setTimeout> | undefined
    function onSelectionChange(): void {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const sel = doc!.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
        const range = sel.getRangeAt(0)
        const el = elementForRange(range)
        if (!isAnchorable(el) || !doc!.body.contains(el)) return
        const quote = cap(sel.toString().trim())
        if (quote === "") return
        setTarget(buildTarget(el, quote))
      }, 250)
    }

    function onClick(e: Event): void {
      const evt = e as MouseEvent
      // Selection-based gestures already handled by mouseup; don't double-fire.
      const sel = doc!.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().trim() !== "") return
      const el = evt.target as Element | null
      if (!isAnchorable(el)) return
      evt.preventDefault()
      setTarget(buildTarget(el, quoteFor(el)))
    }

    doc.addEventListener("pointermove", onMove)
    doc.addEventListener("pointerleave", onLeave)
    doc.addEventListener("click", onClick)
    doc.addEventListener("mouseup", onMouseUp)
    doc.addEventListener("selectionchange", onSelectionChange)
    return () => {
      if (timer) clearTimeout(timer)
      clearHover()
      doc.removeEventListener("pointermove", onMove)
      doc.removeEventListener("pointerleave", onLeave)
      doc.removeEventListener("click", onClick)
      doc.removeEventListener("mouseup", onMouseUp)
      doc.removeEventListener("selectionchange", onSelectionChange)
    }
  }, [docVersion, artifactId, uiStore.htmlInteractive])

  // Highlight existing element-comment selectors + publish miss set for the
  // outdated badge. Runs whenever the comment set or the iframe DOM changes.
  useEffect(() => {
    if (docVersion === 0) {
      uiStore.setOutdatedElementCommentIds(new Set())
      return
    }
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    clearCommentHighlights(doc)
    const misses = new Set<string>()
    for (const comment of elementComments) {
      const anchor = comment.anchor
      if (anchor?.type !== "element") continue
      if (isOutdated(doc, { selector: anchor.selector, quote: anchor.quote })) {
        misses.add(comment.id)
      } else {
        locate(doc, anchor.selector)?.classList.add(COMMENT_HIGHLIGHT_CLASS)
      }
    }
    uiStore.setOutdatedElementCommentIds(misses)
  }, [elementComments, docVersion])

  // Apply the sticky "targeted" highlight + recompute the popover anchor rect.
  useLayoutEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) {
      setAnchorRect(null)
      return
    }
    for (const el of Array.from(doc.querySelectorAll(`.${TARGET_HIGHLIGHT_CLASS}`))) {
      el.classList.remove(TARGET_HIGHLIGHT_CLASS)
    }
    if (!target) {
      setAnchorRect(null)
      return
    }
    const el = locate(doc, target.selector)
    if (!el) {
      setAnchorRect(null)
      return
    }
    el.classList.add(TARGET_HIGHLIGHT_CLASS)
    const recompute = () => {
      const ifr = iframeRef.current
      if (!ifr) return
      const eRect = el.getBoundingClientRect()
      const fRect = ifr.getBoundingClientRect()
      setAnchorRect(
        new DOMRect(
          fRect.left + eRect.left,
          fRect.top + eRect.top,
          eRect.width,
          eRect.height
        )
      )
    }
    recompute()
    const win = doc.defaultView
    win?.addEventListener("scroll", recompute, true)
    window.addEventListener("scroll", recompute, true)
    window.addEventListener("resize", recompute)
    return () => {
      win?.removeEventListener("scroll", recompute, true)
      window.removeEventListener("scroll", recompute, true)
      window.removeEventListener("resize", recompute)
      el.classList.remove(TARGET_HIGHLIGHT_CLASS)
    }
  }, [target, docVersion])

  // Side mode: hand the targeted anchor off to ui-store so the side rail's
  // composer picks it up. Inline mode keeps the popover local and never
  // populates the store (so the rail doesn't render a stale composer if the
  // viewport widens).
  useEffect(() => {
    if (inline) return
    uiStore.setHtmlAnchorTarget(target)
  }, [inline, target])

  // Clear state on unmount so a later view doesn't see stale misses / targets.
  useEffect(() => {
    return () => {
      uiStore.setOutdatedElementCommentIds(new Set())
      uiStore.setHtmlAnchorTarget(null)
    }
  }, [])

  // Close target on Escape anywhere.
  useEffect(() => {
    if (!target) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setTarget(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [target])

  // Element comments matching the current target's selector. Must live above
  // every conditional return so the hook order stays stable when loading
  // flips off — see the wrapper docstring for the prior crash.
  const matchingComments = useMemo(() => {
    if (!target) return [] as Comment[]
    return elementComments.filter(
      (c) => c.anchor?.type === "element" && c.anchor.selector === target.selector
    )
  }, [elementComments, target])

  if (contentError) return <Notice title="Can't load this HTML" message={contentError} nested={nested} />
  if (loading && content === "")
    return <Notice title="Loading…" message="Fetching the document." nested={nested} />

  const unanchored = comments.filter((c) => !c.anchor)
  // Header-controls (single-file bare) fills the card edge to edge: no side or
  // bottom padding around the full-bleed iframe.
  const containerClass = headerControls
    ? "flex flex-col gap-3"
    : nested
      ? "flex flex-col gap-3 px-3 pb-3"
      : "flex flex-col gap-3"

  // Default height fills the viewport: a single-file route gets a tall preview,
  // each stacked (nested) file gets roughly one screen, and fullscreen lets the
  // iframe fill the flex-1 overlay body. When the controls live in the card
  // header (headerControls), the iframe goes full-bleed: no rounding or matting.
  const iframeClass = fullscreen
    ? "block h-full w-full bg-white"
    : headerControls
      ? "block h-[calc(100vh-9rem)] min-h-[480px] w-full rounded-none bg-white"
      : nested
        ? "block h-[100vh] w-full rounded-md bg-white"
        : "block h-[calc(100vh-12rem)] min-h-[480px] w-full rounded-md bg-white"

  const toolbar = (
    <HtmlToolbar zoom={zoom} fullscreen={fullscreen} setZoom={setZoom} setFullscreen={setFullscreen} />
  )

  return (
    <div className={containerClass}>
      <HtmlPaperFrame
        nested={nested}
        fullscreen={fullscreen}
        bare={headerControls}
        toolbar={headerControls ? undefined : toolbar}
        hint={headerControls ? undefined : "Click any element to comment"}
      >
        <iframe
          ref={iframeRef}
          title={snapshot.artifact.title}
          srcDoc={srcdoc}
          // allow-scripts is required for Safari: WebKit bug 218086 blocks the
          // parent's pointer/click/selection listeners on a same-origin sandboxed
          // iframe unless allow-scripts is set. The reviewed HTML is local, trusted
          // content, so running its scripts is acceptable.
          sandbox="allow-same-origin allow-scripts"
          onLoad={onLoad}
          className={iframeClass}
        />
      </HtmlPaperFrame>

      {inline && target && anchorRect && (
        <HtmlAnchorPopover
          rect={anchorRect}
          onDismiss={() => setTarget(null)}
        >
          {matchingComments.length > 0 && (
            <section className="flex flex-col gap-2 border-b border-line pb-2.5">
              <AnimatePresence initial={false}>
                {matchingComments.map((comment) => (
                  <CommentCard key={comment.id} comment={comment} context="inline" />
                ))}
              </AnimatePresence>
            </section>
          )}
          <HtmlAnchorComposer
            target={target}
            onClose={() => setTarget(null)}
            variant="popover"
          />
        </HtmlAnchorPopover>
      )}

      {/* Comments that can't be anchored in the iframe (no anchor + element
       * comments whose selector no longer resolves) fall back to inline cards
       * so they don't disappear when their popover host is gone. */}
      {inline && (unanchored.length > 0 || strandedElementComments(elementComments, iframeRef.current?.contentDocument ?? null).length > 0) && (
        <section className="flex flex-col gap-2">
          {unanchored.map((comment) => (
            <CommentCard key={comment.id} comment={comment} context="inline" />
          ))}
          {strandedElementComments(elementComments, iframeRef.current?.contentDocument ?? null).map((comment) => (
            <CommentCard key={comment.id} comment={comment} context="inline" />
          ))}
        </section>
      )}
    </div>
  )
})

/** Floating popover anchored to a rect in viewport coordinates. */
function HtmlAnchorPopover(props: {
  rect: DOMRect
  onDismiss: () => void
  children: React.ReactNode
}) {
  const { rect, onDismiss, children } = props
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Click outside dismisses (clicks inside the iframe don't bubble here, so
  // this only fires for true parent-document clicks).
  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      const node = popoverRef.current
      if (!node) return
      if (node.contains(e.target as Node)) return
      onDismiss()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [onDismiss])

  const POPOVER_WIDTH = 360
  const margin = 12
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768
  // Narrow screens can't host a floating popover without covering the very
  // element being commented on, so dock it as a bottom sheet instead. The
  // element keeps its sticky highlight, so the anchor stays visible above.
  const narrow = viewportW < 640
  // Prefer below the target; flip above when the bottom would overflow.
  const preferAbove = rect.bottom + 240 + margin > viewportH && rect.top > 240
  const top = preferAbove ? Math.max(margin, rect.top - margin) : rect.bottom + 8
  let left = rect.left
  if (left + POPOVER_WIDTH + margin > viewportW) {
    left = Math.max(margin, viewportW - POPOVER_WIDTH - margin)
  }

  const style: React.CSSProperties = narrow
    ? { position: "fixed", left: margin, right: margin, bottom: margin, width: "auto", zIndex: 60 }
    : {
        position: "fixed",
        top,
        left,
        width: POPOVER_WIDTH,
        transform: preferAbove ? "translateY(-100%)" : undefined,
        zIndex: 60
      }

  return createPortal(
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label="Element comment"
      initial={{ opacity: 0, y: narrow ? 12 : preferAbove ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: narrow ? 12 : 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={style}
      className="flex flex-col gap-2 rounded-xl border border-line-strong bg-popover p-3 text-popover-foreground shadow-[var(--elev-overlay)] ring-1 ring-inset ring-line-soft"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-faint">
          Element comment
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close"
          onClick={onDismiss}
          className="h-5 w-5 p-0"
        >
          <X size={12} />
        </Button>
      </div>
      {children}
    </motion.div>,
    document.body
  )
}

/** Zoom stepper + fullscreen toggle. Rendered in the file card header on the
 * single-file route, or inline in the paper frame otherwise. */
function HtmlToolbar(props: {
  zoom: number
  fullscreen: boolean
  setZoom: React.Dispatch<React.SetStateAction<number>>
  setFullscreen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const { zoom, fullscreen, setZoom, setFullscreen } = props
  return (
    <div className="flex items-center gap-1.5">
      <ButtonGroup>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
        >
          <ZoomOut size={13} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Reset zoom to 100%"
          aria-live="polite"
          onClick={() => setZoom(1)}
          className="min-w-[3.25rem] justify-center px-0 tabular-nums text-muted-foreground"
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
        >
          <ZoomIn size={13} />
        </Button>
      </ButtonGroup>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={() => setFullscreen((f) => !f)}
      >
        {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </Button>
    </div>
  )
}

/**
 * Frames the rendered HTML iframe as an intentional document preview. The
 * iframe carries the user's authored HTML, which we can't restyle, so a hard
 * white body would clash visually inside dark themes. The framing — outer
 * matting + a small `Rendered HTML` chip — reads the white surface as
 * deliberate paper, not a contrast bug.
 */
function HtmlPaperFrame(props: {
  children: React.ReactNode
  nested?: boolean
  fullscreen?: boolean
  bare?: boolean
  toolbar?: React.ReactNode
  hint?: React.ReactNode
}) {
  // Bare: controls live in the card header, so drop the matting and chip and let
  // the iframe fill the card edge to edge.
  if (props.bare) {
    return (
      <section aria-label="Rendered HTML preview" className="overflow-hidden bg-white">
        {props.children}
      </section>
    )
  }

  const outer = props.fullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-soft p-3 sm:p-4"
    : props.nested
      ? "bg-soft p-3 sm:p-4"
      : "rounded-xl border border-line bg-soft p-3 shadow-[var(--elev-1)] ring-1 ring-inset ring-line-soft sm:p-4"
  const inner = props.fullscreen
    ? "min-h-0 flex-1 overflow-hidden rounded-md bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(15,23,42,0.18)] ring-1 ring-inset ring-black/5"
    : "overflow-hidden rounded-md bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(15,23,42,0.18)] ring-1 ring-inset ring-black/5"
  return (
    <section aria-label="Rendered HTML preview" className={outer}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            <FileText size={11} aria-hidden />
            <span>Rendered HTML</span>
          </div>
          {props.hint && (
            <span className="hidden min-w-0 truncate text-[11px] text-faint sm:inline">
              {props.hint}
            </span>
          )}
        </div>
        {props.toolbar}
      </header>
      <div className={inner}>{props.children}</div>
    </section>
  )
}

function Notice(props: { title: string; message: string; nested?: boolean }) {
  const className = props.nested
    ? "flex flex-col items-center gap-3 px-6 py-12 text-center"
    : "flex flex-col items-center gap-3 rounded-xl border border-line bg-editor px-6 py-16 text-center"
  return (
    <article className={className}>
      <div className="text-sm font-medium text-heading">{props.title}</div>
      <p className="max-w-sm text-[13px] text-muted-foreground">{props.message}</p>
    </article>
  )
}

/**
 * Wrap the reviewed HTML so:
 *  - relative asset urls resolve through the artifact's asset route, and
 *  - the doctype + a wrapping `<html>` shell guarantee a parseable document,
 *    even when the artifact under review is a fragment.
 *
 * We do not strip `<script>`: the iframe runs with `allow-scripts` (see the
 * iframe's sandbox note), so scripts in the trusted local artifact execute.
 */
function composeSrcdoc(html: string, base: string): string {
  const baseTag = `<base href="${escapeAttr(base)}/">`
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>${baseTag}`)
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, (_m, attrs) => `<html${attrs}><head>${baseTag}</head>`)
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function elementForRange(range: Range): Element | null {
  const node = range.commonAncestorContainer
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function applyHighlightStyle(doc: Document): void {
  let style = doc.getElementById("suikou-anchor-style") as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement("style")
    style.id = "suikou-anchor-style"
    doc.head.appendChild(style)
  }
  style.textContent = highlightStyle()
}

function clearCommentHighlights(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll(`.${COMMENT_HIGHLIGHT_CLASS}`))) {
    el.classList.remove(COMMENT_HIGHLIGHT_CLASS)
  }
}

/** Element-anchored comments whose selector no longer resolves against the iframe. */
function strandedElementComments(comments: Comment[], doc: Document | null): Comment[] {
  if (!doc) return []
  return comments.filter((c) => {
    if (c.anchor?.type !== "element") return false
    return isOutdated(doc, { selector: c.anchor.selector, quote: c.anchor.quote })
  })
}
