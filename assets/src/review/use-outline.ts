import { useEffect, useState } from "react"

import { langForPath, outline, type OutlineItem } from "../treesitter/outline"

export interface OutlineState {
  items: OutlineItem[]
  loading: boolean
}

/**
 * Table-of-contents entries for the current file. Markdown (and any unsupported
 * type) uses heading scanning; recognised code and Gherkin files parse with
 * Tree-sitter, whose grammar loads on demand.
 */
export function useOutline(content: string, path: string): OutlineState {
  const lang = langForPath(path)
  const [state, setState] = useState<OutlineState>(() => ({
    items: lang ? [] : markdownHeadings(content),
    loading: lang !== null
  }))

  useEffect(() => {
    if (!lang) {
      setState({ items: markdownHeadings(content), loading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ items: prev.items, loading: true }))

    outline(content, lang)
      .then((items) => {
        if (!cancelled) setState({ items, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ items: [], loading: false })
      })

    return () => {
      cancelled = true
    }
  }, [content, path, lang])

  return state
}

/** Markdown ATX headings (levels 1-4), skipping fenced code blocks. */
function markdownHeadings(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false

  content.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const match = /^(#{1,4})\s+(.*)/.exec(line)
    if (match) {
      items.push({ level: match[1].length, text: match[2].trim(), line: index + 1 })
    }
  })

  return items
}
