import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { AnimatePresence, motion } from "motion/react"
import { SquarePlus } from "lucide-react"

import { CommentCard } from "../CommentCard"
import { useReviewCommands } from "../commands"
import { isOutdated, locate, selectorFor } from "../element-selector"
import type { Comment } from "../types"
import { CRITIQUE_META } from "../types"
import { assetBase } from "../urls"
import type { CritiqueType } from "../../stores/ui-store"
import { Button } from "@/components/ui/button"
import type { ViewProps } from "./registry"

interface PendingSelection {
  selector: string
  quote: string
}

const TYPES: CritiqueType[] = ["fix_required", "needs_answer", "note"]

const TYPE_TONE: Record<string, string> = {
  red: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
  amber: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/30",
  muted: "bg-soft text-heading ring-1 ring-inset ring-line"
}

const HIGHLIGHT_CLASS = "suikou-anchor-highlight"
const HIGHLIGHT_STYLE = `.${HIGHLIGHT_CLASS}{outline:2px solid #2563eb;outline-offset:2px;background:rgba(37,99,235,0.08);}`

export const HtmlView = observer(function HtmlView(props: ViewProps) {
  const { view, inline } = props
  const { snapshot, content, contentError, loading, comments } = view
  const artifactId = snapshot.artifact.id

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [docVersion, setDocVersion] = useState(0)
  const [pending, setPending] = useState<PendingSelection | null>(null)

  const srcdoc = useMemo(
    () => composeSrcdoc(content, assetBase(artifactId)),
    [content, artifactId]
  )

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    injectHighlightStyle(doc)
    setDocVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    function onMouseUp(): void {
      // Reading selection inside a brief microtask gives the browser time to
      // finalize the range after the mouseup event.
      queueMicrotask(() => {
        const sel = doc!.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
        const range = sel.getRangeAt(0)
        const el = elementForRange(range)
        if (!el || !doc!.body.contains(el)) return
        const quote = sel.toString().trim()
        if (quote === "") return
        setPending({ selector: selectorFor(el), quote })
      })
    }
    doc.addEventListener("mouseup", onMouseUp)
    return () => {
      doc.removeEventListener("mouseup", onMouseUp)
    }
  }, [docVersion])

  const elementComments = useMemo(
    () => comments.filter((c) => c.anchor?.type === "element"),
    [comments]
  )

  const decorated = useMemo<DecoratedComment[]>(() => {
    if (docVersion === 0) return []
    const doc = iframeRef.current?.contentDocument
    if (!doc) return []
    clearHighlights(doc)
    return elementComments.map((comment) => {
      const anchor = comment.anchor!
      if (anchor.type !== "element") return { comment, outdated: false }
      const outdated = isOutdated(doc, { selector: anchor.selector, quote: anchor.quote })
      if (!outdated) {
        const el = locate(doc, anchor.selector)
        el?.classList.add(HIGHLIGHT_CLASS)
      }
      return { comment, outdated }
    })
  }, [elementComments, docVersion])

  if (contentError) return <Notice title="Can't load this HTML" message={contentError} />
  if (loading && content === "")
    return <Notice title="Loading…" message="Fetching the document." />

  const unanchored = comments.filter((c) => !c.anchor)

  return (
    <div className="flex flex-col gap-3">
      <iframe
        ref={iframeRef}
        title={snapshot.artifact.title}
        srcDoc={srcdoc}
        sandbox="allow-same-origin"
        onLoad={onLoad}
        className="min-h-[480px] w-full rounded-2xl border border-line bg-editor"
      />

      {pending && (
        <HtmlComposer
          selector={pending.selector}
          quote={pending.quote}
          onClose={() => setPending(null)}
        />
      )}

      {inline && (
        <section className="flex flex-col gap-2">
          {unanchored.map((comment) => (
            <CommentCard key={comment.id} comment={comment} context="inline" />
          ))}
          <AnimatePresence initial={false}>
            {decorated.map(({ comment, outdated }) => (
              <CommentCard
                key={comment.id}
                comment={outdated ? withOutdated(comment) : comment}
                context="inline"
              />
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
})

interface DecoratedComment {
  comment: Comment
  outdated: boolean
}

function withOutdated(comment: Comment): Comment {
  if (comment.outdated) return comment
  return { ...comment, outdated: true }
}

const HtmlComposer = observer(function HtmlComposer(props: {
  selector: string
  quote: string
  onClose: () => void
}) {
  const commands = useReviewCommands()
  const [body, setBody] = useState("")
  const [type, setType] = useState<CritiqueType>("note")

  function suggest(): void {
    const fence = `> ${props.quote.split("\n").join("\n> ")}`
    setBody((prev) => `${prev}${prev ? "\n\n" : ""}${fence}\n\n`)
  }

  function add(): void {
    if (!body.trim()) return
    void commands.addComment.dispatch({
      scope: "located",
      critique_type: type,
      body: body.trim(),
      anchor: { type: "element", selector: props.selector, quote: props.quote }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex flex-col gap-2 rounded-lg border border-blue-soft bg-surface p-3 shadow-[var(--surface-shadow)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-[12px] font-medium text-heading">
          New comment on selected region
        </span>
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

      <blockquote className="max-h-24 overflow-y-auto rounded-md border border-line bg-editor px-2 py-1.5 text-[12px] text-muted-foreground">
        {props.quote}
      </blockquote>

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
          disabled={props.quote === ""}
        >
          <SquarePlus size={13} />
          Quote
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

/**
 * Wrap the reviewed HTML so:
 *  - relative asset urls resolve through the artifact's asset route, and
 *  - the doctype + a wrapping `<html>` shell guarantee a parseable document,
 *    even when the artifact under review is a fragment.
 *
 * We do not strip `<script>`: the sandbox attribute is `allow-same-origin`
 * WITHOUT `allow-scripts`, so the browser refuses to run any script in the
 * embedded document regardless of how it got there.
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
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function elementForRange(range: Range): Element | null {
  const node = range.commonAncestorContainer
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function injectHighlightStyle(doc: Document): void {
  if (doc.getElementById("suikou-anchor-style")) return
  const style = doc.createElement("style")
  style.id = "suikou-anchor-style"
  style.textContent = HIGHLIGHT_STYLE
  doc.head.appendChild(style)
}

function clearHighlights(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll(`.${HIGHLIGHT_CLASS}`))) {
    el.classList.remove(HIGHLIGHT_CLASS)
  }
}
