import MarkdownIt from "markdown-it"
import deflist from "markdown-it-deflist"
import { full as emoji } from "markdown-it-emoji"
import footnote from "markdown-it-footnote"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"

// One renderer is shared by document previews and comment bodies. Embedded
// HTML stays disabled, and markdown-it rejects unsafe link protocols.
export const markdown = new MarkdownIt({ html: false, linkify: true })
  .use(deflist)
  .use(emoji)
  .use(footnote)
  .use(sub)
  .use(sup)

const defaultFence =
  markdown.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().toLowerCase()

  // Mermaid fences render to an SVG diagram client-side (lazy `useMermaid`
  // hydration) so the heavy layout lib stays out of the base bundle. Emit a
  // placeholder carrying the source; the hook fills in the SVG after mount.
  if (info === "mermaid") {
    return `<div class="mermaid-diagram my-3 flex justify-center overflow-x-auto" data-mermaid="${markdown.utils.escapeHtml(token.content)}"></div>`
  }

  if (info !== "suggestion") {
    return defaultFence(tokens, idx, options, env, self)
  }

  const rows = token.content
    .replace(/\n$/, "")
    .split("\n")
    .map(
      (line) =>
        `<span class="block rounded-[4px] bg-approve-soft px-1.5 text-ink">${markdown.utils.escapeHtml(line) || " "}</span>`,
    )
    .join("")

  return (
    `<div class="my-2 overflow-hidden rounded-[9px] border border-approve-edge bg-soft/50">` +
    `<div class="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-approve">Suggested change</div>` +
    `<div class="whitespace-pre overflow-x-auto px-2 py-1.5 font-mono text-[11.5px] leading-[1.6]">${rows}</div>` +
    `</div>`
  )
}
