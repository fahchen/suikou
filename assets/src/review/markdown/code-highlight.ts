import { useEffect, type RefObject } from "react"

import { highlightLines } from "../highlight"

// Each fenced code block renders one `<pre class="md-code-line" data-lang>` per
// source line (see code-blocks.ts). A comment landing mid-fence splits it into
// several `.md-fence` segments, but every line of the same fence shares one
// `data-code-group`, so we group by that: joining a group's lines back together
// gives the highlighter the whole-fence context even across a split, and the
// resulting per-line tokens map back one-to-one onto the `<pre>` rows.
export function useCodeHighlight(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const groups = new Map<string, { lang: string; rows: HTMLElement[] }>()
    for (const pre of root.querySelectorAll<HTMLElement>(".md-code-line[data-lang]:not([data-hl])")) {
      const lang = pre.dataset.lang ?? ""
      if (!lang) continue
      const fence = pre.closest<HTMLElement>(".md-fence[data-code-group]")
      const gid = fence?.dataset.codeGroup ?? ""
      const bucket = groups.get(gid)
      if (bucket) bucket.rows.push(pre)
      else groups.set(gid, { lang, rows: [pre] })
    }
    if (groups.size === 0) return

    let cancelled = false
    for (const { lang, rows } of groups.values()) {
      for (const pre of rows) pre.dataset.hl = "1"
      const code = rows.map((pre) => pre.textContent ?? "").join("\n")
      void highlightLines(code, lang).then((lines) => {
        if (cancelled) return
        rows.forEach((pre, index) => paint(pre, lines[index] ?? []))
      })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Rebuild the row's `<code>` from themed tokens. textContent (not innerHTML)
// escapes each token, so highlighted source can't inject markup. Colors are
// `var(--shiki-*)`, so a theme switch re-skins without a re-highlight.
function paint(pre: HTMLElement, tokens: { content: string; color?: string }[]): void {
  const code = pre.querySelector("code")
  if (!code) return
  const frag = document.createDocumentFragment()
  for (const token of tokens) {
    const span = document.createElement("span")
    if (token.color) span.style.color = token.color
    span.textContent = token.content
    frag.appendChild(span)
  }
  if (!frag.childNodes.length) frag.appendChild(document.createTextNode(" "))
  code.replaceChildren(frag)
}
