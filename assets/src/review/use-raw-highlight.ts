import { useEffect, useState } from "react"
import type { ThemedToken } from "shiki"

import { THEME_CODE, type ThemeName } from "../themes"
import { shikiLangForPath } from "../markdown/highlighter"
import { tokenize, tokenKey } from "../markdown/tokenize"
import { loadCached, peekCached, saveCached } from "../markdown/render-cache"

/**
 * Syntax-highlighted tokens for the raw file view, one entry per source line, or
 * null when the file type has no grammar (rendered as plain text). A cache hit
 * (content hash + theme) paints coloured immediately with no plain flash; a cold
 * key shows raw text first, tokenizes off the main thread, then caches the result
 * for the next visit / reload.
 */
export function useRawHighlight(
  content: string,
  path: string,
  theme: ThemeName,
  etag = ""
): ThemedToken[][] | null {
  const lang = shikiLangForPath(path)
  const shikiTheme = THEME_CODE[theme].shiki
  const cacheKey = tokenKey(etag, shikiTheme, "raw")
  const [lines, setLines] = useState<ThemedToken[][] | null>(() =>
    lang && content !== "" ? (peekCached<ThemedToken[][]>(cacheKey) ?? null) : null
  )

  useEffect(() => {
    // Skip empty content: there's nothing to colour, and its etag is "" until the
    // fetch resolves, so tokenizing here would cache [] under the shared empty-etag
    // key and let unrelated files read each other's entry.
    if (!lang || content === "") {
      setLines(null)
      return
    }

    const warm = peekCached<ThemedToken[][]>(cacheKey)
    if (warm) {
      setLines(warm)
      return
    }

    let cancelled = false
    setLines(null)

    void (async () => {
      const cached = await loadCached<ThemedToken[][]>(cacheKey)
      if (cancelled) return
      if (cached) {
        setLines(cached)
        return
      }

      try {
        const tokens = await tokenize(content, lang, shikiTheme, cacheKey)
        if (cancelled) return
        void saveCached(cacheKey, tokens)
        setLines(tokens)
      } catch {
        if (!cancelled) setLines(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [content, lang, shikiTheme, cacheKey])

  return lines
}
