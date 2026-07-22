import { useEffect, type RefObject } from "react"

// A per-line code fence scrolls as one native container (every row shares a
// single `.md-fence-track` inside `.md-fence-scroll`), so its rows stay in sync
// for free. But a comment or composer landing mid-fence splits the block into
// several `.md-fence` segments (above and below the thread), each its own
// scroller — so they would scroll independently. This groups every segment that
// shares a `data-code-group` and drives them from one visible bar: all segments
// are forced to the same scroll extent and one scrollbar (offset by the
// line-number gutter, matching the wide-table treatment) moves them together.
export function useCodeSync(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const cleanups: (() => void)[] = []
    const layout = () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
      const groups = new Map<string, HTMLElement[]>()
      for (const fence of root.querySelectorAll<HTMLElement>(".md-fence[data-code-group]")) {
        const gid = fence.dataset.codeGroup ?? ""
        const bucket = groups.get(gid)
        if (bucket) bucket.push(fence)
        else groups.set(gid, [fence])
      }
      for (const fences of groups.values()) attachGroup(fences, cleanups)
    }

    layout()
    window.addEventListener("resize", layout)
    return () => {
      window.removeEventListener("resize", layout)
      for (const cleanup of cleanups.splice(0)) cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function attachGroup(fences: HTMLElement[], cleanups: (() => void)[]) {
  const scrollers: HTMLElement[] = []
  const tracks: HTMLElement[] = []
  for (const fence of fences) {
    const scroll = fence.querySelector<HTMLElement>(".md-fence-scroll")
    const track = scroll?.querySelector<HTMLElement>(".md-fence-track")
    if (scroll && track) {
      scroll.style.overflowX = "auto"
      track.style.minWidth = ""
      scrollers.push(scroll)
      tracks.push(track)
    }
  }
  if (scrollers.length === 0) return

  // The longest line across every segment sets the shared scroll extent; forcing
  // each track to it makes the segments' scrollLeft ranges line up.
  const extent = Math.max(...scrollers.map((s) => s.scrollWidth))
  if (extent <= scrollers[0].clientWidth) return
  for (const track of tracks) track.style.minWidth = `${extent}px`

  const first = fences[0]
  const gutter = first.querySelector<HTMLElement>(".md-fence-nums")?.getBoundingClientRect().width ?? 0
  const bar = document.createElement("div")
  bar.dataset.syncBar = "1"
  bar.className = "md-table-hscroll"
  bar.style.marginLeft = `${gutter}px`
  bar.style.marginRight = "1rem"
  const spacer = document.createElement("div")
  spacer.style.width = `${extent}px`
  spacer.style.height = "1px"
  bar.appendChild(spacer)
  first.parentNode?.insertBefore(bar, first)

  // No feedback guard needed: writing an already-equal scrollLeft fires no
  // scroll event, so the bar and every segment converge in one hop.
  const fromBar = () => {
    for (const scroll of scrollers) scroll.scrollLeft = bar.scrollLeft
  }
  // A programmatic `bar.scrollLeft =` fires the bar's scroll event only on the
  // next frame, so drive the sibling segments here too — they must move in the
  // same frame as the one the user is dragging, not a frame behind.
  const fromScroll = (origin: HTMLElement) => () => {
    bar.scrollLeft = origin.scrollLeft
    for (const scroll of scrollers) if (scroll !== origin) scroll.scrollLeft = origin.scrollLeft
  }
  const handlers = scrollers.map((scroll) => fromScroll(scroll))
  bar.addEventListener("scroll", fromBar)
  scrollers.forEach((scroll, i) => scroll.addEventListener("scroll", handlers[i]))

  cleanups.push(() => {
    bar.removeEventListener("scroll", fromBar)
    scrollers.forEach((scroll, i) => scroll.removeEventListener("scroll", handlers[i]))
    bar.remove()
    for (const track of tracks) track.style.minWidth = ""
  })
}
