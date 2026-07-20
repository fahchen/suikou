import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { observer } from "mobx-react-lite"
import type { StoreProxy } from "@musubi/react"
import { Crosshair, Lock, MessageSquarePlus, X } from "lucide-react"

import { useMusubiCommand } from "../../musubi"
import type { Comment, CommentsStoreProxy, CritiqueType } from "./comments/shared"
import { Composer } from "./comments/Composer"
import { CommentThread } from "./comments/CommentThread"

type FileStoreProxy = StoreProxy<"SuikouWeb.Stores.FileStore", Musubi.Stores>
type ElRect = { top: number; left: number; right: number; bottom: number; width: number; height: number }
type HtmlOverlay = { kind: "compose"; selector: string; quote: string; rect: ElRect } | { kind: "thread"; selector: string; rect: ElRect }

export const HtmlView = observer(function HtmlView({
  source,
  mode,
  zoom,
  frameRef,
  showComments,
  comments,
  fileProxy,
  commentsProxy,
  draftScope,
}: {
  source: string
  mode: "comment" | "interactive"
  zoom: number
  frameRef: RefObject<HTMLDivElement | null>
  showComments: boolean
  comments: Comment[]
  fileProxy: FileStoreProxy | null
  commentsProxy: CommentsStoreProxy | null
  draftScope: string
}) {
  const interactive = mode === "interactive"
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const addComment = useMusubiCommand(fileProxy as FileStoreProxy, "add_comment")
  const [overlay, setOverlay] = useState<HtmlOverlay | null>(null)
  const [hover, setHover] = useState<{ selector: string; rect: ElRect } | null>(null)
  const [anchoredRects, setAnchoredRects] = useState<{ selector: string; rect: ElRect }[]>([])
  const [rectsReported, setRectsReported] = useState(false)
  const elOpenKey = `suikou-elopen:${draftScope}`
  const [pendingRestore, setPendingRestore] = useState<{ selector: string; quote: string } | null>(() => {
    if (interactive) return null
    try {
      const stored = JSON.parse(localStorage.getItem(elOpenKey) || "null")
      if (typeof stored?.selector === "string" && hasElDraftBody(draftScope, stored.selector)) {
        return { selector: stored.selector, quote: typeof stored.quote === "string" ? stored.quote : "" }
      }
    } catch {
      // fall through
    }
    localStorage.removeItem(elOpenKey)
    return null
  })
  const [, setTick] = useState(0)
  const [addingComment, setAddingComment] = useState(false)

  const applyOverlay = (next: HtmlOverlay | null) => {
    setOverlay(next)
    if (next?.kind === "compose") localStorage.setItem(elOpenKey, JSON.stringify({ selector: next.selector, quote: next.quote }))
    else localStorage.removeItem(elOpenKey)
  }

  const anchoredSelectors = useMemo(
    () =>
      showComments
        ? Array.from(new Set(comments.flatMap((comment) => (comment.anchor?.type === "element" ? [comment.anchor.selector] : []))))
        : [],
    [comments, showComments],
  )
  const openThreads = useMemo(
    () =>
      overlay?.kind === "thread"
        ? comments.filter((comment) => comment.anchor?.type === "element" && comment.anchor.selector === overlay.selector)
        : [],
    [comments, overlay],
  )
  const strandedComments = useMemo(() => {
    if (interactive || !showComments || !rectsReported) return []
    const resolved = new Set(anchoredRects.map((item) => item.selector))
    return comments.filter((comment) => comment.anchor?.type === "element" && !resolved.has(comment.anchor.selector))
  }, [comments, anchoredRects, rectsReported, interactive, showComments])
  const threadQuote = openThreads[0]?.anchor?.type === "element" ? openThreads[0].anchor.quote : ""
  const quote = overlay?.kind === "compose" ? overlay.quote : threadQuote
  const showComposer = overlay?.kind === "compose" || addingComment
  const trackSel = overlay?.selector ?? pendingRestore?.selector ?? null
  const trackRef = useRef<string | null>(trackSel)
  trackRef.current = trackSel
  const pendingRef = useRef(pendingRestore)
  pendingRef.current = pendingRestore
  const srcDoc = useMemo(() => `${source}\n<script>${htmlAnchorScript()}</scr` + `ipt>`, [source])
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const post = (message: object) => iframeRef.current?.contentWindow?.postMessage({ source: "suikou-host", ...message }, "*")

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (!data || data.source !== "suikou-html") return
      if (data.kind === "ready") {
        post({ kind: "mode", interactive: interactiveRef.current })
        if (!interactiveRef.current) post({ kind: "anchors", selectors: anchoredSelectors })
        if (trackRef.current) post({ kind: "track", selector: trackRef.current })
      } else if (data.kind === "rects") {
        setAnchoredRects(Array.isArray(data.items) ? data.items : [])
        setRectsReported(true)
      } else if (data.kind === "hover") {
        setHover(data.selector && data.rect ? { selector: String(data.selector), rect: data.rect } : null)
      } else if (data.kind === "pick" && data.rect) {
        applyOverlay({ kind: "compose", selector: String(data.selector), quote: String(data.quote ?? ""), rect: data.rect })
      } else if (data.kind === "open" && data.rect) {
        applyOverlay({ kind: "thread", selector: String(data.selector), rect: data.rect })
      } else if (data.kind === "rect" && data.rect) {
        const pending = pendingRef.current
        if (pending && pending.selector === data.selector) {
          applyOverlay({ kind: "compose", selector: pending.selector, quote: pending.quote, rect: data.rect })
          setPendingRestore(null)
        } else {
          setOverlay((current) => (current && current.selector === data.selector ? { ...current, rect: data.rect } : current))
        }
      }
    }
    window.addEventListener("message", onMessage)
    setRectsReported(false)
    post({ kind: "anchors", selectors: anchoredSelectors })
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchoredSelectors])

  useEffect(() => {
    post({ kind: "track", selector: trackSel })
    if (!trackSel) return
    const onResize = () => setTick((tick) => tick + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSel])

  useEffect(() => {
    post({ kind: "mode", interactive })
    if (interactive) {
      setOverlay(null)
      setHover(null)
      setAnchoredRects([])
      setRectsReported(false)
      setPendingRestore(null)
    } else {
      post({ kind: "anchors", selectors: anchoredSelectors })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  const submit = (body: string, type: CritiqueType) => {
    if (!fileProxy || !overlay) return
    const quote = overlay.kind === "compose" ? overlay.quote : threadQuote
    addComment
      .dispatch({ scope: "located", critique_type: type, body, anchor: { type: "element", selector: overlay.selector, quote } })
      .then(() => {
        setAddingComment(false)
        if (overlay.kind === "compose") applyOverlay(null)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    setAddingComment(false)
  }, [overlay?.selector, overlay?.kind])

  const frameRect = frameRef.current?.getBoundingClientRect()
  const overlayPos =
    overlay && frameRect
      ? {
          left: Math.min(Math.max(frameRect.left + overlay.rect.left * zoom, 8), window.innerWidth - 348),
          top: Math.min(frameRect.top + overlay.rect.bottom * zoom + 8, window.innerHeight - 90),
        }
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor p-[14px]">
      {strandedComments.length > 0 && (
        <div className="mb-[14px] max-h-[38%] shrink-0 overflow-auto rounded-panel border border-hair-strong bg-soft/40 p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Crosshair size={12} className="text-accent" aria-hidden />
            Stranded {strandedComments.length === 1 ? "comment" : "comments"}
            <span className="font-normal normal-case tracking-normal text-faint">· element no longer in the page</span>
          </div>
          {strandedComments.map((comment) => (
            <CommentThread key={comment.id} comment={comment} commentsProxy={commentsProxy} className="my-1" />
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[11px] border border-hair-strong bg-canvas shadow-sm">
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-hair-strong bg-surface px-2.5">
          <Lock size={11} className="shrink-0 text-faint" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-2xs">
            {interactive ? (
              <span className="text-faint">Interactive preview · comments paused</span>
            ) : hover ? (
              <span className="text-ink">{hover.selector}</span>
            ) : (
              <span className="text-faint">Sandboxed preview · click any element to comment</span>
            )}
          </span>
        </div>
        <div ref={frameRef} className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
          <iframe
            ref={iframeRef}
            title="HTML preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            className="block border-0 bg-white"
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          />
          {!interactive && (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              {hover && (
                <div
                  className="absolute rounded-[4px] bg-accent-soft ring-1 ring-inset ring-accent-edge"
                  style={{
                    left: hover.rect.left * zoom,
                    top: hover.rect.top * zoom,
                    width: hover.rect.width * zoom,
                    height: hover.rect.height * zoom,
                  }}
                />
              )}
              {anchoredRects.map(({ selector, rect }) => (
                <button
                  key={selector}
                  type="button"
                  aria-label="Open comment"
                  onMouseEnter={() => setHover({ selector, rect })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => applyOverlay({ kind: "thread", selector, rect })}
                  style={{ left: rect.right * zoom, top: rect.top * zoom }}
                  className="group pointer-events-auto absolute grid size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center"
                >
                  <span className="relative flex size-[8px] transition-transform duration-100 group-hover:scale-[1.2]">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex size-[8px] rounded-full bg-accent shadow-[0_0_0_2px_white,0_1px_3px_oklch(0%_0_0/0.3)]" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {overlay &&
        overlayPos &&
        !interactive &&
        createPortal(
          <div
            style={{ position: "fixed", left: overlayPos.left, top: overlayPos.top, zIndex: 40, width: 340 }}
            className="overflow-hidden rounded-panel border border-hair-strong bg-surface shadow-[0_16px_40px_oklch(0%_0_0/0.32)]"
          >
            <div className="flex items-center gap-2 border-b border-hair px-3 py-2 text-xs">
              <span className="truncate font-mono text-accent-bright">{overlay.selector}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => applyOverlay(null)}
                className="grid size-[18px] shrink-0 place-items-center rounded text-faint hover:bg-soft hover:text-ink"
                aria-label="Close"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-2.5">
              {quote && (
                <div className="mb-2 truncate rounded-md bg-soft px-2.5 py-1.5 font-mono text-xs text-muted shadow-[inset_0_0_0_1px_var(--hair-strong)]">
                  “{quote}”
                </div>
              )}
              {openThreads.map((comment) => (
                <CommentThread key={comment.id} comment={comment} commentsProxy={commentsProxy} className="mb-2 last:mb-0" />
              ))}
              {showComposer ? (
                <Composer
                  anchorLabel="this element"
                  draftKey={elDraftKey(draftScope, overlay.selector)}
                  pending={addComment.isPending}
                  chrome={false}
                  onSubmit={submit}
                  onCancel={() => (overlay.kind === "compose" ? applyOverlay(null) : setAddingComment(false))}
                  className={openThreads.length > 0 ? "m-0 mt-2" : "m-0"}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingComment(true)}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-ctrl border border-dashed border-hair-strong py-1.5 text-xs font-semibold text-muted hover:bg-soft hover:text-ink"
                >
                  <MessageSquarePlus size={13} aria-hidden />
                  Add comment
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
})

function elDraftKey(scope: string, selector: string): string {
  return `suikou-eldraft:${scope}:${selector}`
}

function hasElDraftBody(scope: string, selector: string): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(elDraftKey(scope, selector)) || "{}")
    return typeof value?.body === "string" && value.body.trim().length > 0
  } catch {
    return false
  }
}

function htmlAnchorScript(): string {
  return `
(function () {
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s; }
  function selectorFor(el) {
    if (!el || el === document.body || el === document.documentElement) return "body";
    if (el.id) return "#" + esc(el.id);
    var parts = [], node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.id) { parts.unshift("#" + esc(node.id)); break; }
      var tag = node.tagName.toLowerCase(), parent = node.parentElement;
      if (parent) {
        var same = [];
        for (var i = 0; i < parent.children.length; i++) if (parent.children[i].tagName === node.tagName) same.push(parent.children[i]);
        var idx = same.indexOf(node);
        if (same.length > 1 && idx >= 0) tag += ":nth-of-type(" + (idx + 1) + ")";
      }
      parts.unshift(tag);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  function quoteFor(el) { return (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200); }
  function rectOf(el) { var r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }
  function elFor(sel) { try { return document.querySelector(sel); } catch (_) { return null; } }

  var anchored = [], tracked = null, hoverSel = null, active = true;
  function postAnchored() {
    var items = [];
    for (var i = 0; i < anchored.length; i++) { var el = elFor(anchored[i]); if (el) items.push({ selector: anchored[i], rect: rectOf(el) }); }
    parent.postMessage({ source: "suikou-html", kind: "rects", items: items }, "*");
  }
  function postHover() {
    var el = hoverSel ? elFor(hoverSel) : null;
    parent.postMessage({ source: "suikou-html", kind: "hover", selector: hoverSel, rect: el ? rectOf(el) : null }, "*");
  }
  function postTracked() {
    if (!tracked) return;
    var el = elFor(tracked);
    if (el) parent.postMessage({ source: "suikou-html", kind: "rect", selector: tracked, rect: rectOf(el) }, "*");
  }
  document.addEventListener("pointermove", function (e) {
    if (!active) return;
    var t = e.target;
    var ok = t && t.nodeType === 1 && t !== document.body && t !== document.documentElement;
    var sel = ok ? selectorFor(t) : null;
    if (sel !== hoverSel) { hoverSel = sel; postHover(); }
  }, true);
  document.addEventListener("pointerleave", function () { if (hoverSel !== null) { hoverSel = null; postHover(); } }, true);
  document.addEventListener("click", function (e) {
    if (!active) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    e.preventDefault(); e.stopPropagation();
    var sel = selectorFor(t);
    if (anchored.indexOf(sel) !== -1) parent.postMessage({ source: "suikou-html", kind: "open", selector: sel, rect: rectOf(t) }, "*");
    else parent.postMessage({ source: "suikou-html", kind: "pick", selector: sel, quote: quoteFor(t), rect: rectOf(t) }, "*");
  }, true);
  function sync() { postAnchored(); postTracked(); if (hoverSel) postHover(); }
  window.addEventListener("scroll", sync, true);
  window.addEventListener("resize", sync);
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "suikou-host") return;
    if (d.kind === "anchors") { anchored = d.selectors || []; postAnchored(); }
    if (d.kind === "track") { tracked = d.selector || null; postTracked(); }
    if (d.kind === "mode") { active = !d.interactive; if (!active && hoverSel !== null) { hoverSel = null; postHover(); } }
  });
  parent.postMessage({ source: "suikou-html", kind: "ready" }, "*");
})();
`
}
