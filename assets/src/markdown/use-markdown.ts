import { useEffect, useState } from "react"

import type { ThemeName } from "../themes"
import { renderMarkdown, type RenderedBlock } from "./render"

export interface MarkdownState {
  blocks: RenderedBlock[]
  loading: boolean
}

/** Renders markdown to line-mapped blocks, re-running when content or theme changes. */
export function useMarkdown(content: string, theme: ThemeName): MarkdownState {
  const [state, setState] = useState<MarkdownState>({ blocks: [], loading: true })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ blocks: prev.blocks, loading: true }))

    renderMarkdown(content, theme).then((blocks) => {
      if (!cancelled) {
        setState({ blocks, loading: false })
      }
    })

    return () => {
      cancelled = true
    }
  }, [content, theme])

  return state
}
