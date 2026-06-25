import { useEffect, useState } from "react"
import type { ThemedToken } from "shiki"

import { THEME_CODE, type ThemeName } from "../themes"
import { shikiLangForPath } from "../markdown/highlighter"
import { peekTokens, tokenize, tokenKey } from "../markdown/tokenize"

/**
 * Syntax-highlighted tokens for the raw file view, one entry per source line, or
 * null when the file type has no grammar (rendered as plain text). Tokenization
 * runs off the main thread and is cached by `etag` + theme, so a revisit paints
 * coloured immediately with no plain flash; a cold key shows raw text first and
 * upgrades to colour once the worker tokenizes.
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
  const [lines, setLines] = useState<ThemedToken[][] | null>(() => peekTokens(cacheKey) ?? null)

  useEffect(() => {
    if (!lang) {
      setLines(null)
      return
    }

    const cached = peekTokens(cacheKey)
    if (cached) {
      setLines(cached)
      return
    }

    let cancelled = false
    setLines(null)

    tokenize(content, lang, shikiTheme, cacheKey)
      .then((tokens) => {
        if (!cancelled) setLines(tokens)
      })
      .catch(() => {
        if (!cancelled) setLines(null)
      })

    return () => {
      cancelled = true
    }
  }, [content, lang, shikiTheme, cacheKey])

  return lines
}
