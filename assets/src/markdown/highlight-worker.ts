import type { BundledLanguage } from "shiki"

import { ensureLang, getHighlighter, SHIKI_THEME } from "./highlighter"

export interface TokenizeRequest {
  id: number
  code: string
  /** Already-resolved Shiki language, or "text". */
  lang: string
}

self.onmessage = async (event: MessageEvent<TokenizeRequest>) => {
  const { id, code, lang } = event.data
  try {
    const hl = await getHighlighter()
    await ensureLang(hl, lang)
    const loaded = hl.getLoadedLanguages().includes(lang) ? lang : "text"
    // The css-variables theme makes tokenization theme-independent: `token.color`
    // is `var(--shiki-*)`, resolved per UI theme by CSS at paint time.
    const { tokens } = hl.codeToTokens(code, { lang: loaded as BundledLanguage, theme: SHIKI_THEME })
    self.postMessage({ id, tokens })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
