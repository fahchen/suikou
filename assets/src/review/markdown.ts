import MarkdownIt from "markdown-it"

// Shared instance: comment bodies are short, so one configured renderer is
// cheaper than per-call setup. `html: false` escapes embedded HTML and the
// default link validator rejects `javascript:`/`data:` URLs, so the rendered
// string is safe to inject.
const md = new MarkdownIt({ html: false, linkify: true })

/** Render a comment/reply markdown body to a sanitized HTML string. */
export function renderMarkdown(src: string): string {
  return md.render(src)
}
