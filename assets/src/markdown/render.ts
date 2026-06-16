import MarkdownIt from "markdown-it"
import Token from "markdown-it/lib/token.mjs"
import { full as emoji } from "markdown-it-emoji"
import footnote from "markdown-it-footnote"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"

import { THEME_CODE, type ThemeName } from "../themes"
import { ensureLang, getHighlighter, resolveLang } from "./highlighter"
import { renderMermaid } from "./mermaid"

export type BlockKind = "markdown" | "code" | "mermaid"

/** GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists) or strict CommonMark. */
export type MarkdownFlavor = "gfm" | "commonmark"

/** Where to resolve a markdown image's relative `src` against the backend. */
export interface AssetContext {
  /** URL prefix serving the artifact's project files, e.g. `/api/review/<id>/asset`. */
  base: string
  /** The markdown file's directory within its project (`""` at the project root). */
  dir: string
}

interface AssetEnv {
  suikouAsset?: AssetContext
}

export interface RenderedBlock {
  /** 1-based, inclusive source line where the block begins. */
  startLine: number
  /** 1-based, inclusive source line where the block ends. */
  endLine: number
  html: string
  kind: BlockKind
  /** Top-level HTML tag for markdown blocks (`h2`, `p`, `ul`, `table`, …), else "".
   * List items split out of a list group carry `li` so each is anchorable. */
  tag: string
  /** Fence language for code blocks, else null. */
  lang: string | null
}

/**
 * GFM: default preset (tables, strikethrough, autolinks) plus task lists,
 * `:emoji:` shortcodes, footnotes, and `~sub~` / `^sup^`.
 */
const gfm = new MarkdownIt({ html: false, linkify: true, typographer: true })
taskLists(gfm)
assetImages(gfm)
gfm.use(emoji).use(footnote).use(sub).use(sup)

/** Strict CommonMark: no tables/strikethrough/autolinks/task lists. */
const commonmark = new MarkdownIt("commonmark", { html: false, typographer: true })
assetImages(commonmark)

/**
 * Parses markdown into top-level blocks, each carrying its source line range so
 * the editor can render a line gutter and anchor comments. Code fences are
 * highlighted with Shiki; ```mermaid fences render to inline SVG. The `flavor`
 * selects GitHub Flavored Markdown (default) or strict CommonMark.
 */
export async function renderMarkdown(
  content: string,
  theme: ThemeName,
  flavor: MarkdownFlavor = "gfm",
  asset?: AssetContext
): Promise<RenderedBlock[]> {
  const md = flavor === "commonmark" ? commonmark : gfm
  const env: AssetEnv = { suikouAsset: asset }
  const tokens = md.parse(content, env)
  const groups = groupTopLevel(tokens)
  const { shiki } = THEME_CODE[theme]
  const highlighter = await getHighlighter()

  const grouped = await Promise.all(
    groups.map(async (group): Promise<RenderedBlock[]> => {
      const first = group[0]
      if (first && (first.type === "bullet_list_open" || first.type === "ordered_list_open")) {
        return splitListGroup(group, md, env)
      }

      const [startLine, endLine] = lineRange(group)
      const fence = group.length === 1 && group[0].type === "fence" ? group[0] : null

      if (fence && fence.info.trim().toLowerCase().startsWith("mermaid")) {
        return [{ startLine, endLine, kind: "mermaid", tag: "", lang: "mermaid", html: renderMermaid(fence.content) }]
      }

      if (fence) {
        const lang = resolveLang(fence.info)
        await ensureLang(highlighter, lang)
        const html = highlighter.codeToHtml(fence.content.replace(/\n$/, ""), { lang, theme: shiki })
        return [{ startLine, endLine, kind: "code", tag: "", lang, html }]
      }

      return [
        {
          startLine,
          endLine,
          kind: "markdown",
          tag: group[0]?.tag ?? "",
          lang: null,
          html: md.renderer.render(group, md.options, env)
        }
      ]
    })
  )

  return grouped.flat()
}

/**
 * Splits a top-level list token group into one `RenderedBlock` per list item so
 * each `<li>` gets its own line gutter and is independently commentable. Each
 * item renders as a standalone single-item list that preserves its marker
 * (bullet, or `<ol start="N">` for continuous numbering), task-list checkbox,
 * and nesting indent. Nested items recurse into their own blocks in document
 * order so they are anchorable too.
 */
function splitListGroup(group: Token[], md: MarkdownIt, env: AssetEnv): RenderedBlock[] {
  return splitListRange(group, 0, group.length - 1, 0, md, env)
}

function splitListRange(
  tokens: Token[],
  openIdx: number,
  closeIdx: number,
  depth: number,
  md: MarkdownIt,
  env: AssetEnv
): RenderedBlock[] {
  const ordered = tokens[openIdx].type === "ordered_list_open"
  const startAttr = ordered ? Number(tokens[openIdx].attrGet("start") ?? "1") || 1 : 1
  const blocks: RenderedBlock[] = []
  let i = openIdx + 1
  let number = startAttr

  while (i < closeIdx) {
    if (tokens[i].type !== "list_item_open") {
      i++
      continue
    }
    const itemOpen = tokens[i]
    const itemClose = matchClose(tokens, i)
    const own: Token[] = []
    const nested: Array<[number, number]> = []
    let k = i + 1
    while (k < itemClose) {
      const t = tokens[k]
      if (t.type === "bullet_list_open" || t.type === "ordered_list_open") {
        const close = matchClose(tokens, k)
        nested.push([k, close])
        k = close + 1
      } else {
        own.push(t)
        k++
      }
    }

    const [startLine, endLine] = lineRange(own.length > 0 ? own : [itemOpen])
    blocks.push({
      startLine,
      endLine,
      kind: "markdown",
      tag: "li",
      lang: null,
      html: renderListItem(itemOpen, own, ordered, number, depth, md, env)
    })

    for (const [ns, ne] of nested) {
      blocks.push(...splitListRange(tokens, ns, ne, depth + 1, md, env))
    }

    number++
    i = itemClose + 1
  }

  return blocks
}

/** Index of the `*_close` token matching the `*_open` token at `openIdx`. */
function matchClose(tokens: Token[], openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < tokens.length; i++) {
    depth += tokens[i].nesting
    if (depth === 0) return i
  }
  return tokens.length - 1
}

/**
 * Renders one list item as a standalone single-item list, reusing the item's
 * own tokens (minus any nested sub-lists, which become their own blocks). The
 * wrapping list carries the marker semantics: `<ol start="N">` for continuous
 * ordered numbering and a per-depth indent so nested items read as nested.
 */
function renderListItem(
  itemOpen: Token,
  own: Token[],
  ordered: boolean,
  number: number,
  depth: number,
  md: MarkdownIt,
  env: AssetEnv
): string {
  const listOpen = new Token(ordered ? "ordered_list_open" : "bullet_list_open", ordered ? "ol" : "ul", 1)
  listOpen.block = true
  listOpen.attrSet("style", listStyle(ordered, depth))
  if (ordered && number !== 1) listOpen.attrSet("start", String(number))

  const listClose = new Token(ordered ? "ordered_list_close" : "bullet_list_close", ordered ? "ol" : "ul", -1)
  listClose.block = true

  const itemClose = new Token("list_item_close", "li", -1)
  itemClose.block = true

  const slice = [listOpen, itemOpen, ...own, itemClose, listClose]
  return md.renderer.render(slice, md.options, env)
}

/** Per-depth indent (and nested bullet marker) for a standalone single-item list. */
function listStyle(ordered: boolean, depth: number): string {
  const parts = [`padding-left:${(depth + 1) * 19}px`]
  if (!ordered && depth > 0) parts.push("list-style-type:circle")
  return parts.join(";")
}

/**
 * GitHub task-list support: turns `- [ ]` / `- [x]` list items into disabled
 * checkboxes. Runs after inline parsing so the leading `[ ]` text token exists,
 * then rewrites it to a checkbox and tags the `<li>` for CSS styling.
 */
function taskLists(parser: MarkdownIt): void {
  parser.core.ruler.after("inline", "task-lists", (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "inline" || tokens[i - 2]?.type !== "list_item_open") continue
      const inline = tokens[i]
      const first = inline.children?.[0]
      if (!first || first.type !== "text") continue
      const match = /^\[([ xX])\]\s/.exec(first.content)
      if (!match) continue

      const checked = match[1].toLowerCase() === "x"
      first.content = first.content.slice(match[0].length)

      const box = new state.Token("html_inline", "", 0)
      box.content = `<input class="task-checkbox" type="checkbox" disabled${
        checked ? " checked" : ""
      }> `
      inline.children?.unshift(box)

      const li = tokens[i - 2]
      li.attrJoin("class", "task-item")
    }
    return true
  })
}

/**
 * Rewrites a markdown image's relative `src` to the backend asset route so
 * repo-relative images (e.g. `![](img/x.png)`) load. Absolute URLs, protocol-
 * relative URLs, `data:` URIs, and root-absolute paths are left untouched. The
 * target is `<base>/<fileDir>/<src>`, resolved server-side against the project.
 */
function assetImages(parser: MarkdownIt): void {
  const fallback = parser.renderer.rules.image
  parser.renderer.rules.image = (tokens, idx, options, env: AssetEnv, self) => {
    const token = tokens[idx]
    const attr = token.attrIndex("src")
    const ctx = env?.suikouAsset
    if (ctx && attr >= 0 && token.attrs) {
      const src = token.attrs[attr][1]
      if (isRepoRelative(src)) {
        const path = joinRelative(ctx.dir, src)
        token.attrs[attr][1] = `${ctx.base}/${path.split("/").map(encodeURIComponent).join("/")}`
      }
    }
    return fallback
      ? fallback(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}

/** A bare relative reference: no scheme, no `//`, no leading `/`, no `#` anchor. */
function isRepoRelative(src: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src)
}

/** POSIX-joins `dir` and `rel`, collapsing `.`/`..` segments without escaping past root. */
function joinRelative(dir: string, rel: string): string {
  const out: string[] = []
  for (const part of `${dir}/${rel}`.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

/** Splits a flat token stream into top-level block groups by nesting depth. */
function groupTopLevel(tokens: Token[]): Token[][] {
  const groups: Token[][] = []
  let current: Token[] = []
  let depth = 0

  for (const token of tokens) {
    current.push(token)
    depth += token.nesting

    if (depth === 0) {
      groups.push(current)
      current = []
    }
  }

  if (current.length > 0) {
    groups.push(current)
  }

  return groups
}

/** Returns the 1-based inclusive [start, end] source lines spanned by a group. */
function lineRange(group: Token[]): [number, number] {
  let start = Infinity
  let end = 0

  for (const token of group) {
    if (token.map) {
      start = Math.min(start, token.map[0])
      end = Math.max(end, token.map[1])
    }
  }

  if (!Number.isFinite(start)) {
    return [1, 1]
  }

  return [start + 1, end]
}
