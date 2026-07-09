import MarkdownIt from "markdown-it"

// One renderer is shared by document previews and comment bodies. Embedded
// HTML stays disabled, and markdown-it rejects unsafe link protocols.
export const markdown = new MarkdownIt({ html: false, linkify: true })

const defaultFence =
  markdown.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim().toLowerCase() !== "suggestion") {
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
