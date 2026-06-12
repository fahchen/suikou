import { useEffect, useState } from "react"
import type { BundledLanguage, ThemedToken } from "shiki"

import { THEME_CODE, type ThemeName } from "../themes"
import { getHighlighter, shikiLangForPath } from "../markdown/highlighter"

/**
 * Syntax-highlighted tokens for the raw file view, one entry per source line, or
 * null when the file type has no grammar (rendered as plain text). Re-runs when
 * the content, file path, or theme changes; resolves progressively so the raw
 * text shows immediately and upgrades to colour once Shiki tokenizes.
 */
export function useRawHighlight(
  content: string,
  path: string,
  theme: ThemeName
): ThemedToken[][] | null {
  const lang = shikiLangForPath(path)
  const [lines, setLines] = useState<ThemedToken[][] | null>(null)

  useEffect(() => {
    if (!lang) {
      setLines(null)
      return
    }

    let cancelled = false
    setLines(null)

    getHighlighter()
      .then((highlighter) => {
        const { shiki } = THEME_CODE[theme]
        const loaded = highlighter.getLoadedLanguages().includes(lang) ? lang : "text"
        return highlighter.codeToTokens(content, { lang: loaded as BundledLanguage, theme: shiki })
          .tokens
      })
      .then((tokens) => {
        if (!cancelled) setLines(tokens)
      })
      .catch(() => {
        if (!cancelled) setLines(null)
      })

    return () => {
      cancelled = true
    }
  }, [content, path, lang, theme])

  return lines
}
