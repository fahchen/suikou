import { useEffect, type RefObject } from "react"

/**
 * Keep every per-line code block in a fence group scrolling as one unit: when
 * any line scrolls horizontally, mirror its `scrollLeft` to its siblings. Lines
 * are split into separate gutter rows for commenting, so a shared scroll
 * container isn't available; this syncs them instead. Re-runs when `deps` change
 * (host re-injects fresh lines on new markdown).
 */
export function useCodeScroll(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    // Give every line in a group the widest line's content width so short lines
    // become scrollable to the same extent — otherwise they can't follow the
    // mirrored scrollLeft and the block would shear.
    const groups = new Map<string, HTMLElement[]>()
    for (const line of root.querySelectorAll<HTMLElement>(".md-code-line[data-code-group]")) {
      const key = line.dataset.codeGroup as string
      ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(line)
    }
    for (const lines of groups.values()) {
      const width = Math.max(...lines.map((line) => line.firstElementChild?.scrollWidth ?? 0))
      for (const line of lines) {
        const code = line.firstElementChild as HTMLElement | null
        if (code) code.style.minWidth = `${width}px`
      }
    }

    let syncing = false
    const onScroll = (event: Event) => {
      const line = event.target
      if (syncing || !(line instanceof HTMLElement) || !line.dataset.codeGroup) return
      syncing = true
      for (const sibling of root.querySelectorAll<HTMLElement>(
        `.md-code-line[data-code-group="${line.dataset.codeGroup}"]`,
      )) {
        if (sibling !== line) sibling.scrollLeft = line.scrollLeft
      }
      syncing = false
    }

    // scroll doesn't bubble, so listen in the capture phase from the root.
    root.addEventListener("scroll", onScroll, true)
    return () => root.removeEventListener("scroll", onScroll, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
