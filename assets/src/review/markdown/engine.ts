import DOMPurify from "dompurify"
import MarkdownIt from "markdown-it"
import deflist from "markdown-it-deflist"
import { full as emoji } from "markdown-it-emoji"
import footnote from "markdown-it-footnote"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"
import { encodeMermaidSource } from "./mermaid"
import type { AssetContext } from "./types"

// One renderer is shared by document previews and comment bodies. Embedded HTML
// is allowed so README-style `<h1><img>` blocks render, but every rendered
// string is run through `sanitize` before it reaches the DOM (see below).
export const markdown = new MarkdownIt({ html: true, linkify: true })
  .use(deflist)
  .use(emoji)
  .use(footnote)
  .use(sub)
  .use(sup)

// The checkout is the default root: an unmarked src is a path under it, and a
// review's file list spells those without a marker. `@scratch/` opts into the
// review's scratch directory instead. Only a file that already lives in the
// checkout resolves relative to its own directory — that is where a relative
// link has always pointed, and it is what keeps a repo's README rendering.
//
// The scratch marker works one way. A committed file naming `@scratch/` gets
// `null` back and is left un-rewritten, because such a link is dead outside
// Suikou and manufacturing a working URL for it here would hide that. The
// server refuses the same reference on the artifact asset route.
function assetPath(dir: string, src: string): string | null {
  const fromScratch = dir === "@scratch" || dir.startsWith("@scratch/")
  if (src.startsWith("@scratch/")) return fromScratch ? src : null
  if (src.startsWith("@project/")) return joinRelative("", src.slice("@project/".length))
  if (fromScratch) return joinRelative("", src)
  return joinRelative(dir, src)
}

// A repo-relative image src (no scheme, not root/protocol/anchor) is rewritten
// to the review's live raw-asset endpoint; anything absolute or external is left
// untouched.
function rewriteSrc(ctx: AssetContext, src: string): string {
  if (!isRepoRelative(src)) return src
  const path = assetPath(ctx.dir, src)
  if (path === null) return src
  return `/api/review/${ctx.reviewId}/files/raw?path=${encodeURIComponent(path)}`
}

// The DOMPurify hook below runs on every `sanitize` call and needs the current
// asset context; there is no per-call channel through DOMPurify, so pass it via
// this module-scoped handoff, set and cleared around each call.
let activeCtx: AssetContext | undefined

// Rewrite repo-relative `src` on raw-HTML `<img>` tags too (markdown `![]()`
// images are handled earlier by the renderer rule; this covers README-style
// `<img src="...">` that only appears once html is sanitized into real nodes).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!activeCtx || node.nodeName !== "IMG") return
  const src = (node as Element).getAttribute("src")
  if (src) (node as Element).setAttribute("src", rewriteSrc(activeCtx, src))
})

// Strip XSS vectors from rendered HTML. Keep `data-mermaid` so the lazy mermaid
// hook can still read the diagram source off the placeholder div.
export function sanitize(html: string, ctx?: AssetContext): string {
  activeCtx = ctx
  try {
    return DOMPurify.sanitize(html, { ADD_ATTR: ["data-mermaid"] })
  } finally {
    activeCtx = undefined
  }
}

// GFM-style task list items: `- [ ]` / `- [x]` become a disabled checkbox in
// front of the item text. Runs after inline parsing so the marker is stripped
// from the first text node and a checkbox is prepended to the same inline token,
// which flows through the per-item block renderer unchanged.
markdown.core.ruler.after("inline", "task_lists", (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]
    if (
      inline.type !== "inline" ||
      tokens[i - 1].type !== "paragraph_open" ||
      tokens[i - 2].type !== "list_item_open"
    ) {
      continue
    }
    const match = /^\[([ xX])\]\s+/.exec(inline.content)
    const first = inline.children?.[0]
    if (!match || !first || first.type !== "text") continue

    first.content = first.content.replace(/^\[([ xX])\]\s+/, "")
    inline.content = inline.content.slice(match[0].length)

    const box = new state.Token("html_inline", "", 0)
    box.content = `<input class="md-task" type="checkbox" disabled${match[1] === " " ? "" : " checked"}> `
    inline.children!.unshift(box)
    tokens[i - 2].attrJoin("class", "md-task-item")
  }
})

const defaultImage =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

// Rewrite repo-relative markdown image src to the review's live raw-asset
// endpoint. Requires an `assetContext` in env (threaded from the preview).
markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const ctx = (env as { assetContext?: AssetContext }).assetContext
  const token = tokens[idx]
  const srcIndex = token.attrIndex("src")

  if (ctx && srcIndex >= 0) {
    token.attrs![srcIndex][1] = rewriteSrc(ctx, token.attrs![srcIndex][1])
  }

  return defaultImage(tokens, idx, options, env, self)
}

function isRepoRelative(src: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src)
}

// POSIX-join a file directory with a relative reference, collapsing "." / "..".
function joinRelative(dir: string, rel: string): string {
  const stack = dir.split("/").filter((seg) => seg && seg !== ".")
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") stack.pop()
    else stack.push(seg)
  }
  return stack.join("/")
}

const defaultFence =
  markdown.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().toLowerCase()

  // Mermaid fences render to an SVG diagram client-side (lazy `useMermaid`
  // hydration) so the heavy layout lib stays out of the base bundle. Emit a
  // placeholder carrying the base64 source (raw newlines don't survive
  // sanitization); the hook decodes it and fills in the SVG after mount.
  if (info === "mermaid") {
    return `<div class="mermaid-diagram my-3 flex justify-center overflow-x-auto" data-mermaid="${encodeMermaidSource(token.content)}"></div>`
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
    `<div class="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wide text-approve">Suggested change</div>` +
    `<div class="whitespace-pre overflow-x-auto px-2 py-1.5 font-mono text-xs leading-[1.6]">${rows}</div>` +
    `</div>`
  )
}
