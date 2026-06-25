import { useEffect, useState } from "react"

import type { ThemeName } from "../themes"
import {
  highlightBlocks,
  parseMarkdown,
  type AssetContext,
  type MarkdownFlavor,
  type RenderedBlock
} from "./render"
import { loadCached, peekCached, saveCached } from "./render-cache"

export interface MarkdownState {
  blocks: RenderedBlock[]
  loading: boolean
}

const keyOf = (etag: string, theme: ThemeName, flavor: MarkdownFlavor) =>
  `${etag}|${theme}|md:${flavor}`

/**
 * Renders markdown to line-mapped blocks. A cache hit (content hash + theme +
 * flavor) paints the finished blocks directly — no parse, no worker. On a miss
 * it renders progressively: structure and plain code paint synchronously, then
 * Shiki colour swaps in once a worker tokenizes the fences, and the finished
 * blocks are cached for the next visit / reload.
 */
export function useMarkdown(
  content: string,
  theme: ThemeName,
  flavor: MarkdownFlavor = "gfm",
  asset?: AssetContext,
  etag = ""
): MarkdownState {
  const [state, setState] = useState<MarkdownState>(() => {
    const cached = content === "" ? undefined : peekCached<RenderedBlock[]>(keyOf(etag, theme, flavor))
    return cached ? { blocks: cached, loading: false } : { blocks: [], loading: content !== "" }
  })

  useEffect(() => {
    if (content === "") {
      setState({ blocks: [], loading: false })
      return
    }

    const key = keyOf(etag, theme, flavor)
    const warm = peekCached<RenderedBlock[]>(key)
    if (warm) {
      setState({ blocks: warm, loading: false })
      return
    }

    let cancelled = false
    void (async () => {
      const cached = await loadCached<RenderedBlock[]>(key)
      if (cancelled) return
      if (cached) {
        setState({ blocks: cached, loading: false })
        return
      }

      const { blocks, fences } = parseMarkdown(content, theme, flavor, asset)
      if (cancelled) return
      setState({ blocks, loading: false })

      const full = await highlightBlocks(blocks, fences, theme, etag)
      if (cancelled) return
      void saveCached(key, full)
      setState({ blocks: full, loading: false })
    })()

    return () => {
      cancelled = true
    }
  }, [content, theme, flavor, asset?.base, asset?.dir, etag])

  return state
}
