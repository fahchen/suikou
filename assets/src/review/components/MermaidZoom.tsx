import { useEffect, useRef, useState, type RefObject } from "react"
import { Minus, Plus, X } from "lucide-react"

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const STEP = 1.2

/**
 * Opens a fullscreen preview when a rendered mermaid diagram inside `docRef` is
 * clicked, with zoom (buttons + wheel) and drag-to-pan. Renders nothing until a
 * diagram is opened. The SVG is lifted from the already-rendered placeholder, so
 * it keeps the live theme CSS variables it was drawn with.
 */
export function MermaidZoom({ docRef }: { docRef: RefObject<HTMLElement | null> }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const open = svg !== null

  useEffect(() => {
    const root = docRef.current
    if (!root) return
    const onClick = (event: MouseEvent) => {
      const diagram = (event.target as HTMLElement).closest(".mermaid-diagram")
      const rendered = diagram?.querySelector("svg")
      if (!rendered) return
      setSvg(rendered.outerHTML)
      setScale(1)
      setPan({ x: 0, y: 0 })
    }
    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  }, [docRef])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSvg(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Native non-passive wheel listener so preventDefault stops the page behind
  // the overlay from scrolling while the wheel zooms the diagram.
  useEffect(() => {
    const node = overlayRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setScale((s) => clamp(s * (event.deltaY < 0 ? STEP : 1 / STEP)))
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [open])

  if (!open) return null

  const zoom = (factor: number) => setScale((s) => clamp(s * factor))

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 backdrop-blur-sm"
      onClick={() => setSvg(null)}
    >
      <div
        className="max-h-full max-w-full cursor-grab touch-none select-none active:cursor-grabbing [&_svg]:h-auto [&_svg]:max-w-none"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          dragOrigin.current = { x: event.clientX - pan.x, y: event.clientY - pan.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragOrigin.current) setPan({ x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y })
        }}
        onPointerUp={() => {
          dragOrigin.current = null
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface px-1.5 py-1 shadow-lg ring-1 ring-hair-strong"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={() => zoom(1 / STEP)} title="Zoom out" className={controlClass}>
          <Minus size={16} />
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoom(STEP)} title="Zoom in" className={controlClass}>
          <Plus size={16} />
        </button>
        <div className="mx-1 h-4 w-px bg-hair-strong" />
        <button type="button" onClick={() => setSvg(null)} title="Close" className={controlClass}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

const controlClass =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-soft hover:text-ink"

function clamp(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}
