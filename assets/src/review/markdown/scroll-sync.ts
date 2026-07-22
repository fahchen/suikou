// A group of side-by-side blocks (table rows, split code-fence segments) that
// must scroll horizontally as one. Rather than give each block its own native
// scroller — which drifts a frame behind when you sync them via scroll events —
// a single visible scrollbar owns the offset and every block is shifted by the
// same `translateX`. One source, so all blocks move in the same frame.
//
// The caller measures the group and clips the blocks' own overflow, then hands
// the transform targets, the pan surfaces (where wheel/touch is read), the
// scroll `extent`, the `gutter` that aligns the bar with the content, and the
// `anchor` the bar is inserted before. Returns a detach function; the caller
// pairs it with its own cleanup for whatever layout it mutated.
export function attachSyncScrollbar(opts: {
  targets: HTMLElement[]
  surfaces: HTMLElement[]
  extent: number
  gutter: number
  anchor: HTMLElement
  marginRight?: string
}): () => void {
  const { targets, surfaces, extent, gutter, anchor, marginRight } = opts
  for (const target of targets) {
    target.style.transform = "translateX(0)"
    target.style.willChange = "transform"
  }

  const bar = document.createElement("div")
  bar.dataset.syncBar = "1"
  bar.className = "md-table-hscroll"
  bar.style.marginLeft = `${gutter}px`
  if (marginRight) bar.style.marginRight = marginRight
  const spacer = document.createElement("div")
  spacer.style.width = `${extent}px`
  spacer.style.height = "1px"
  bar.appendChild(spacer)
  anchor.parentNode?.insertBefore(bar, anchor)

  // A float offset owns the position, not the bar's integer `scrollLeft`. Painting
  // the transform from the float is sub-pixel smooth (no per-frame rounding
  // jitter) and same-tick (no wait for the bar's async scroll event), so a wheel
  // or touch pan tracks the finger 1:1 with no stall and no stair-stepping. The
  // bar just follows as the visible thumb; when the user drags the thumb itself,
  // its scroll event feeds the offset back — the `selfScroll` flag skips the
  // echo from our own thumb writes.
  let offset = 0
  let selfScroll = false
  const maxOffset = () => Math.max(0, extent - bar.clientWidth)
  const paint = () => {
    for (const target of targets) target.style.transform = `translateX(${-offset}px)`
  }
  const setOffset = (value: number) => {
    offset = Math.max(0, Math.min(maxOffset(), value))
    paint()
    selfScroll = true
    bar.scrollLeft = offset
  }
  const onBarScroll = () => {
    if (selfScroll) {
      selfScroll = false
      return
    }
    offset = bar.scrollLeft
    paint()
  }
  bar.addEventListener("scroll", onBarScroll)

  // Forward wheel/touch over any surface to the offset, so the group pans from
  // the content, not only by dragging the bar.
  const onWheel = (event: WheelEvent) => {
    const ax = Math.abs(event.deltaX)
    const ay = Math.abs(event.deltaY)
    // Only a clearly vertical gesture passes through to page scroll. Claiming
    // every frame with a horizontal component (not just the ones where dx wins)
    // kills the first-gesture stall — macOS opens a horizontal swipe with an
    // ambiguous frame that would otherwise leak to back-navigation before we
    // grab it. preventDefault unconditionally so the browser never rubber-bands
    // or navigates back at the scroll extremes.
    if (ax === 0 || ay > ax * 2) return
    event.preventDefault()
    setOffset(offset + event.deltaX)
  }
  let startX = 0
  let startY = 0
  let axis: "?" | "x" | "y" = "?"
  let lastX = 0
  let lastT = 0
  let velocity = 0
  let raf = 0
  const glide = () => {
    const now = performance.now()
    const dt = Math.max(1, now - lastT)
    lastT = now
    const before = offset
    setOffset(before - velocity * dt)
    velocity *= Math.pow(0.95, dt / 16)
    if (Math.abs(velocity) < 0.02 || offset === before) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(glide)
  }
  const onTouchStart = (event: TouchEvent) => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    velocity = 0
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
    lastX = startX
    lastT = performance.now()
    axis = "?"
  }
  const onTouchMove = (event: TouchEvent) => {
    const x = event.touches[0].clientX
    const y = event.touches[0].clientY
    if (axis === "?") axis = Math.abs(x - startX) > Math.abs(y - startY) ? "x" : "y"
    if (axis !== "x") return
    setOffset(offset - (x - startX))
    startX = x
    const now = performance.now()
    const dt = now - lastT
    if (dt > 0) velocity = (x - lastX) / dt
    lastX = x
    lastT = now
    event.preventDefault()
  }
  const onTouchEnd = () => {
    if (axis === "x" && Math.abs(velocity) > 0.02) {
      lastT = performance.now()
      raf = requestAnimationFrame(glide)
    }
  }
  for (const surface of surfaces) {
    surface.addEventListener("wheel", onWheel, { passive: false })
    surface.addEventListener("touchstart", onTouchStart, { passive: true })
    surface.addEventListener("touchmove", onTouchMove, { passive: false })
    surface.addEventListener("touchend", onTouchEnd, { passive: true })
  }

  return () => {
    if (raf) cancelAnimationFrame(raf)
    bar.removeEventListener("scroll", onBarScroll)
    bar.remove()
    for (const surface of surfaces) {
      surface.removeEventListener("wheel", onWheel)
      surface.removeEventListener("touchstart", onTouchStart)
      surface.removeEventListener("touchmove", onTouchMove)
      surface.removeEventListener("touchend", onTouchEnd)
    }
    for (const target of targets) {
      target.style.transform = ""
      target.style.willChange = ""
    }
  }
}
