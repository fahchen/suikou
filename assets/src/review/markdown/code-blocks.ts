import { markdown } from "./engine"
import type { MarkdownToken } from "./token-utils"
import type { MarkdownBlock } from "./types"

// Info strings owned by custom fence renderers (engine.ts) — those stay single
// blocks, so per-line commenting skips them.
const CUSTOM_FENCES = new Set(["mermaid", "suggestion"])

/**
 * Split a fenced code block into one commentable block per source line, so each
 * line gets its own gutter. Returns null for custom fences and info strings that
 * should keep whole-block rendering.
 */
export function renderCodeBlocks(token: MarkdownToken): MarkdownBlock[] | null {
  if (token.type !== "fence" && token.type !== "code_block") return null
  const info = token.info.trim().toLowerCase().split(/\s+/)[0]
  if (CUSTOM_FENCES.has(info)) return null

  // The opening fence sits on map[0]; the first code line is the next source
  // line. `code_block` (indented) has no fence line, so its first line is map[0].
  const openLine = (token.map?.[0] ?? 0) + 1
  const firstCodeLine = token.type === "fence" ? openLine + 1 : openLine

  const lines = token.content.replace(/\n$/, "").split("\n")
  return lines.map((line, index) => {
    const source = firstCodeLine + index
    const position =
      lines.length === 1
        ? "md-code-only"
        : index === 0
          ? "md-code-first"
          : index === lines.length - 1
            ? "md-code-last"
            : ""
    return {
      line: source,
      endLine: source,
      codeGroup: String(openLine),
      html: `<pre class="md-code-line ${position}"><code>${markdown.utils.escapeHtml(line) || " "}</code></pre>`,
    }
  })
}
