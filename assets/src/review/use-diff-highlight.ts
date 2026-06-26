import { useEffect, useState } from "react"
import type { ThemedToken } from "shiki"

import { shikiLangForPath } from "../markdown/highlighter"
import { tokenize, tokenKey } from "../markdown/tokenize"
import { loadCached, peekCached, saveCached } from "../markdown/render-cache"
import type { DiffCell, ParsedDiff } from "./diff-parse"

/** Per-side syntax tokens for a diff, keyed by that side's diff line number. */
export interface DiffTokens {
  old: Map<number, ThemedToken[]>
  new: Map<number, ThemedToken[]>
}

const EMPTY: DiffTokens = { old: new Map(), new: new Map() }

/**
 * Syntax-highlighted tokens for the two-column / unified diff view, keyed per
 * side by diff line number, or empty maps when the file type has no grammar. A
 * cache hit (content hash) paints coloured immediately with no plain flash; a
 * cold key shows raw text first, tokenizes off the main thread, then caches the
 * result for the next visit / reload — mirroring `useRawHighlight`, but for two
 * blobs (old side + new side). Tokenization is theme-independent (css-variables
 * theme), so the active `[data-theme]` recolours the tokens in pure CSS.
 *
 * Each side is tokenized as its own joined blob of just the lines present in the
 * diff, so a multi-line construct (string/comment) that spans a hunk gap loses
 * the cross-gap context a full file would give it. That's inherent to diffs and
 * accepted here; we never reconstruct the whole file.
 */
export function useDiffHighlight(parsed: ParsedDiff, path: string, etag = ""): DiffTokens {
  const lang = shikiLangForPath(path)
  const oldKey = tokenKey(etag, "diff:old")
  const newKey = tokenKey(etag, "diff:new")
  const [tokens, setTokens] = useState<DiffTokens>(() =>
    lang
      ? { old: seedSide(parsed, "old", oldKey), new: seedSide(parsed, "new", newKey) }
      : EMPTY
  )

  useEffect(() => {
    if (!lang) {
      setTokens(EMPTY)
      return
    }

    let cancelled = false
    const next: DiffTokens = { old: new Map(), new: new Map() }
    let resolved = 0

    const commit = () => {
      if (cancelled) return
      resolved++
      if (resolved === 2) setTokens({ old: next.old, new: next.new })
    }

    const resolve = (side: "old" | "new", key: string) => {
      const cells = sideCells(parsed, side)
      if (cells.length === 0) {
        commit()
        return
      }

      const warm = peekCached<ThemedToken[][]>(key)
      if (warm) {
        next[side] = mapCells(cells, warm)
        commit()
        return
      }

      void (async () => {
        const cached = await loadCached<ThemedToken[][]>(key)
        if (cancelled) return
        if (cached) {
          next[side] = mapCells(cells, cached)
          commit()
          return
        }

        try {
          const text = cells.map((c) => c.text).join("\n")
          const t = await tokenize(text, lang, key)
          if (cancelled) return
          void saveCached(key, t)
          next[side] = mapCells(cells, t)
          commit()
        } catch {
          commit()
        }
      })()
    }

    resolve("old", oldKey)
    resolve("new", newKey)

    return () => {
      cancelled = true
    }
  }, [parsed, lang, oldKey, newKey])

  return tokens
}

/** Cells present on `side`, in document order across all hunks. */
function sideCells(parsed: ParsedDiff, side: "old" | "new"): DiffCell[] {
  return parsed.hunks.flatMap((h) => h.rows.flatMap((r) => (r[side] ? [r[side] as DiffCell] : [])))
}

/** Zips a side's cells with their tokenized lines (join order) into a line map. */
function mapCells(cells: DiffCell[], lines: ThemedToken[][]): Map<number, ThemedToken[]> {
  const map = new Map<number, ThemedToken[]>()
  for (let i = 0; i < cells.length; i++) {
    const line = lines[i]
    if (line) map.set(cells[i].lineNo, line)
  }
  return map
}

/** Synchronous initial seed for one side: the cached tokens if warm, else empty. */
function seedSide(parsed: ParsedDiff, side: "old" | "new", key: string): Map<number, ThemedToken[]> {
  const warm = peekCached<ThemedToken[][]>(key)
  if (!warm) return new Map()
  return mapCells(sideCells(parsed, side), warm)
}
