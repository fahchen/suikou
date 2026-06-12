import { useEffect, useState } from "react"

import type { ThemeName } from "../themes"
import { renderMarkdown, type AssetContext, type MarkdownFlavor, type RenderedBlock } from "./render"

export interface MarkdownState {
  blocks: RenderedBlock[]
  loading: boolean
}

/**
 * Renders markdown to line-mapped blocks, re-running when content, theme,
 * flavor, or the image asset context changes.
 */
export function useMarkdown(
  content: string,
  theme: ThemeName,
  flavor: MarkdownFlavor = "gfm",
  asset?: AssetContext
): MarkdownState {
  const [state, setState] = useState<MarkdownState>({ blocks: [], loading: true })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ blocks: prev.blocks, loading: true }))

    renderMarkdown(content, theme, flavor, asset).then((blocks) => {
      if (!cancelled) {
        setState({ blocks, loading: false })
      }
    })

    return () => {
      cancelled = true
    }
  }, [content, theme, flavor, asset?.base, asset?.dir])

  return state
}
