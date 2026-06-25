import type { BundledLanguage } from "shiki"

import { ensureLang, getHighlighter } from "./highlighter"

export interface TokenizeRequest {
  id: number
  code: string
  /** Already-resolved Shiki language, or "text". */
  lang: string
  /** Shiki theme name (e.g. `github-light`), not the UI theme. */
  theme: string
}

self.onmessage = async (event: MessageEvent<TokenizeRequest>) => {
  const { id, code, lang, theme } = event.data
  try {
    const hl = await getHighlighter()
    await ensureLang(hl, lang)
    const loaded = hl.getLoadedLanguages().includes(lang) ? lang : "text"
    const { tokens } = hl.codeToTokens(code, { lang: loaded as BundledLanguage, theme })
    self.postMessage({ id, tokens })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
