import { useEffect, type RefObject } from "react"

// A per-line code fence already scrolls as one native container: every row
// lives in a single `.md-fence-track` inside `.md-fence-scroll`, so long lines
// move together for free (unlike the wide tables, which are separate `<table>`
// elements and need a translateX driver). The only thing missing for parity is
// a *visible* scrollbar — the native one is hidden — so this adds the same
// top bar the tables use, two-way synced with the native scroller and offset by
// the line-number gutter. Native overflow already handles wheel and touch
// momentum, so there is nothing else to wire.
export function useCodeSync(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const cleanups: (() => void)[] = []
    const layout = () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
      for (const fence of root.querySelectorAll<HTMLElement>(".md-fence")) attachBar(fence, cleanups)
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

function attachBar(fence: HTMLElement, cleanups: (() => void)[]) {
  const scroll = fence.querySelector<HTMLElement>(".md-fence-scroll")
  if (!scroll || scroll.scrollWidth <= scroll.clientWidth) return

  const gutter = fence.querySelector<HTMLElement>(".md-fence-nums")?.getBoundingClientRect().width ?? 0
  const bar = document.createElement("div")
  bar.dataset.syncBar = "1"
  bar.className = "md-table-hscroll"
  bar.style.marginLeft = `${gutter}px`
  bar.style.marginRight = "1rem"
  const spacer = document.createElement("div")
  spacer.style.width = `${scroll.scrollWidth}px`
  spacer.style.height = "1px"
  bar.appendChild(spacer)
  fence.parentNode?.insertBefore(bar, fence)

  // Two-way sync needs no guard: writing an already-equal scrollLeft fires no
  // scroll event, so the pair converges in one hop instead of ping-ponging.
  const mirror = (from: HTMLElement, to: HTMLElement) => () => {
    to.scrollLeft = from.scrollLeft
  }
  const onBar = mirror(bar, scroll)
  const onScroll = mirror(scroll, bar)
  bar.addEventListener("scroll", onBar)
  scroll.addEventListener("scroll", onScroll)

  cleanups.push(() => {
    bar.removeEventListener("scroll", onBar)
    scroll.removeEventListener("scroll", onScroll)
    bar.remove()
  })
}
