import { useEffect, useRef } from "react"

import type { DocView } from "../stores/ui-store"
import { loadScrollOffset, saveScrollOffset, scrollPositionKey } from "./scroll-position"

// Coalesce scroll writes so a flick of the wheel doesn't hammer localStorage;
// the trailing edge still lands the final resting offset.
const SAVE_THROTTLE_MS = 150

interface ScrollRestoreOptions {
  /** The vertical scroll container, or null before it mounts. */
  container: HTMLElement | null
  artifactId: string
  view: DocView
  /**
   * Content layout is settled (markdown blocks rendered, not "Rendering…").
   * Restore waits for this so it measures against the final height, not the
   * empty placeholder.
   */
  ready: boolean
  /** Single-file mode only; the all-files stacked view opts out. */
  enabled: boolean
}

/**
 * Remember and restore a single file's scroll offset across file switches and
 * hard reloads. Saves throttled while scrolling (and a final save when the key
 * or container changes / unmounts); restores once per `${artifactId}:${view}`
 * after content is `ready`, deferred through a double rAF and clamped to the
 * current scrollable height.
 */
export function useScrollRestore(options: ScrollRestoreOptions): void {
  const { container, artifactId, view, ready, enabled } = options
  const key = scrollPositionKey(artifactId, view)

  // Guards a single restore per key so toggling `ready` (or unrelated re-renders)
  // can't yank an already-restored container back to the saved offset.
  const restoredKey = useRef<string | null>(null)

  useEffect(() => {
    if (!container || !enabled) return
    let timer: number | null = null
    let pending = false
    const save = () => saveScrollOffset(key, container.scrollTop)
    const flush = () => {
      timer = null
      if (pending) {
        pending = false
        save()
      }
    }
    const onScroll = () => {
      pending = true
      if (timer === null) timer = window.setTimeout(flush, SAVE_THROTTLE_MS)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      if (timer !== null) window.clearTimeout(timer)
      // Final save: on key change (rendered↔raw swap on the same mount) this
      // captures the outgoing view's offset before its restore runs; on unmount
      // it captures the last position before navigating away.
      save()
    }
  }, [container, enabled, key])

  // When the hook is disabled (all-files stacked view), clear the guard so that
  // switching back to single-file mode for the same key restores the saved
  // single-file offset again instead of being stuck where the stacked view sat.
  useEffect(() => {
    if (!enabled) restoredKey.current = null
  }, [enabled])

  useEffect(() => {
    if (!container || !enabled || !ready) return
    if (restoredKey.current === key) return
    restoredKey.current = key

    const offset = loadScrollOffset(key)
    if (offset == null) return

    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const max = Math.max(0, container.scrollHeight - container.clientHeight)
        container.scrollTop = Math.min(offset, max)
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [container, enabled, ready, key])
}
