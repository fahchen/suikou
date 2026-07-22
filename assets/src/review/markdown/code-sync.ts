import { useEffect, type RefObject } from "react"

import { attachSyncScrollbar } from "./scroll-sync"

// A per-line code fence scrolls as one native container (every row shares a
// single `.md-fence-track` inside `.md-fence-scroll`). But a comment or composer
// landing mid-fence splits the block into several `.md-fence` segments — each its
// own scroller — so dragging one and event-syncing the others always lags a
// frame (the origin paints, then JS moves the rest). This drives the whole group
// from ONE source instead: a single visible scrollbar owns the offset and every
// segment's track is shifted by the same `translateX`, so all segments move in
// the same frame with no drift. The comment threads between segments are not
// tracks, so they stay put — detached from the scroll entirely.
export function useCodeSync(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const groups = new Map<string, HTMLElement[]>()
    for (const fence of root.querySelectorAll<HTMLElement>(".md-fence[data-code-group]")) {
      const gid = fence.dataset.codeGroup ?? ""
      const bucket = groups.get(gid)
      if (bucket) bucket.push(fence)
      else groups.set(gid, [fence])
    }
    if (groups.size === 0) return

    const cleanups: (() => void)[] = []
    const layout = () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
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
  const scrolls: HTMLElement[] = []
  const tracks: HTMLElement[] = []
  for (const fence of fences) {
    const scroll = fence.querySelector<HTMLElement>(".md-fence-scroll")
    const track = scroll?.querySelector<HTMLElement>(".md-fence-track")
    if (scroll && track) {
      scroll.style.overflowX = ""
      track.style.width = ""
      track.style.transform = ""
      scrolls.push(scroll)
      tracks.push(track)
    }
  }
  if (scrolls.length === 0) return

  // The longest line across every segment sets the shared extent.
  const extent = Math.max(...tracks.map((t) => t.scrollWidth))
  const available = scrolls[0].clientWidth
  if (extent <= available) return

  // Clip the native scrollers and pin each track to the shared extent, then let
  // the shared scrollbar move them by transform only — one source, no drift.
  for (const scroll of scrolls) scroll.style.overflowX = "clip"
  for (const track of tracks) track.style.width = `${extent}px`

  const first = fences[0]
  const gutter = first.querySelector<HTMLElement>(".md-fence-nums")?.getBoundingClientRect().width ?? 0
  const detach = attachSyncScrollbar({
    targets: tracks,
    surfaces: scrolls,
    extent,
    gutter,
    anchor: first,
    marginRight: "1rem",
  })

  cleanups.push(() => {
    detach()
    for (const scroll of scrolls) scroll.style.overflowX = ""
    for (const track of tracks) track.style.width = ""
  })
}
