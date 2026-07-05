import MarkdownIt from "markdown-it"

// Shared instance: comment bodies are short, so one configured renderer is
// cheaper than per-call setup. `html: false` escapes embedded HTML and the
// default link validator rejects `javascript:`/`data:` URLs, so the rendered
// string is safe to inject.
const md = new MarkdownIt({ html: false, linkify: true })

// F7: a ```suggestion fenced block renders as a proposed-change card (each line
// an "add" row) instead of a plain code block. The content is escaped, so the
// generated HTML is safe to inject alongside the rest of the rendered body.
const defaultFence =
  md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim().toLowerCase() === "suggestion") {
    const rows = token.content
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => `<span class="block rounded-[4px] bg-approve-soft px-1.5 text-ink">${md.utils.escapeHtml(line) || " "}</span>`)
      .join("")
    return (
      `<div class="my-2 overflow-hidden rounded-[9px] border border-approve-edge bg-soft/50">` +
      `<div class="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-approve">Suggested change</div>` +
      `<div class="whitespace-pre overflow-x-auto px-2 py-1.5 font-mono text-[11.5px] leading-[1.6]">${rows}</div>` +
      `</div>`
    )
  }
  return defaultFence(tokens, idx, options, env, self)
}

/** Render a comment/reply markdown body to a sanitized HTML string. */
export function renderMarkdown(src: string): string {
  return md.render(src)
}

/** Extract a heading outline (level / text / 1-based line) from markdown, for
 * the file's table of contents. markdown-it has no grammar dependency, so this
 * works where the tree-sitter outline has no markdown parser. */
export function markdownToc(src: string): { level: number; text: string; line: number }[] {
  const tokens = md.parse(src, {})
  const items: { level: number; text: string; line: number }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === "heading_open" && token.map) {
      const text = tokens[i + 1]?.content ?? ""
      if (text) items.push({ level: Number(token.tag.slice(1)), text, line: token.map[0] + 1 })
    }
  }
  return items
}

export type MarkdownBlock = { line: number; endLine: number; html: string }

/** Split a markdown document into its top-level blocks, each rendered to
 * sanitized HTML and tagged with the 1-based source line range it spans. Blocks
 * are the unit a reviewer anchors a comment to in the preview. */
export function renderMarkdownBlocks(src: string): MarkdownBlock[] {
  const env = {}
  const tokens = md.parse(src, env)
  const blocks: MarkdownBlock[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < tokens.length; i++) {
    if (depth === 0) start = i
    depth += tokens[i].nesting
    if (depth === 0) {
      const first = tokens[start]
      const html = md.renderer.render(tokens.slice(start, i + 1), md.options, env)
      if (html.trim()) {
        // token.map is [startLine0, endLine0Exclusive]; the last source line the
        // block covers (1-based, inclusive) is exactly endLine0Exclusive.
        const line = first.map ? first.map[0] + 1 : 1
        blocks.push({ line, endLine: first.map ? first.map[1] : line, html })
      }
    }
  }
  return blocks
}
