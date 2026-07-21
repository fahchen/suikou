import { useEffect, useRef, useState, type RefObject } from "react"
import { X } from "lucide-react"

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const STEP = 1.2

/**
 * Opens a fullscreen preview when a rendered mermaid diagram inside `docRef` is
 * clicked. Zoom is manual — mouse wheel or two-finger pinch — plus drag-to-pan.
 * Renders nothing until a diagram is opened. The SVG is lifted from the
 * already-rendered placeholder and the overlay uses the app background, so the
 * preview looks identical to the diagram in the document.
 */
export function MermaidZoom({ docRef }: { docRef: RefObject<HTMLElement | null> }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  const panOrigin = useRef<{ x: number; y: number } | null>(null)

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

  const pointerDist = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-canvas"
      onClick={() => setSvg(null)}
    >
      <div
        className="max-h-full max-w-full cursor-grab touch-none select-none active:cursor-grabbing [&_svg]:h-auto [&_svg]:max-w-none"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pointers.current.size === 2) {
            pinch.current = { dist: pointerDist(), scale }
            panOrigin.current = null
          } else if (pointers.current.size === 1) {
            panOrigin.current = { x: event.clientX - pan.x, y: event.clientY - pan.y }
          }
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pointers.current.size >= 2 && pinch.current) {
            const dist = pointerDist()
            if (pinch.current.dist > 0) setScale(clamp(pinch.current.scale * (dist / pinch.current.dist)))
          } else if (panOrigin.current) {
            setPan({ x: event.clientX - panOrigin.current.x, y: event.clientY - panOrigin.current.y })
          }
        }}
        onPointerUp={(event) => releasePointer(event.pointerId)}
        onPointerCancel={(event) => releasePointer(event.pointerId)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setSvg(null)
        }}
        title="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted shadow-lg ring-1 ring-hair-strong transition-colors hover:bg-soft hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  )

  function releasePointer(id: number) {
    pointers.current.delete(id)
    pinch.current = null
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      panOrigin.current = { x: p.x - pan.x, y: p.y - pan.y }
    } else if (pointers.current.size === 0) {
      panOrigin.current = null
    }
  }
}

function clamp(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}
