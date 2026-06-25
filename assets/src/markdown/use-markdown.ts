import { useEffect, useState } from "react"

import type { ThemeName } from "../themes"
import {
  highlightBlocks,
  parseMarkdown,
  type AssetContext,
  type MarkdownFlavor,
  type RenderedBlock
} from "./render"

export interface MarkdownState {
  blocks: RenderedBlock[]
  loading: boolean
}

// Fully-highlighted block lists keyed by content hash + theme + flavor, so a
// revisit / theme toggle / remount paints colored instantly with no re-parse.
const blockCache = new Map<string, RenderedBlock[]>()

/**
 * Renders markdown to line-mapped blocks progressively: structure and plain
 * (uncolored) code paint synchronously on the first frame, then Shiki colour
 * swaps in once a worker tokenizes the fences. Re-runs when content, theme,
 * flavor, the image asset context, or the content hash (`etag`) changes; a
 * cached fully-colored result for the key resolves instantly.
 */
export function useMarkdown(
  content: string,
  theme: ThemeName,
  flavor: MarkdownFlavor = "gfm",
  asset?: AssetContext,
  etag = ""
): MarkdownState {
  const [state, setState] = useState<MarkdownState>({ blocks: [], loading: true })

  useEffect(() => {
    if (content === "") {
      setState({ blocks: [], loading: false })
      return
    }

    const key = `${etag}|${theme}|${flavor}`
    const cached = blockCache.get(key)
    if (cached) {
      setState({ blocks: cached, loading: false })
      return
    }

    let cancelled = false
    const { blocks, fences } = parseMarkdown(content, theme, flavor, asset)
    setState({ blocks, loading: false })

    highlightBlocks(blocks, fences, theme, etag).then((full) => {
      if (!cancelled) {
        blockCache.set(key, full)
        setState({ blocks: full, loading: false })
      }
    })

    return () => {
      cancelled = true
    }
  }, [content, theme, flavor, asset?.base, asset?.dir, etag])

  return state
}
