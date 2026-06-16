import MarkdownIt from "markdown-it"
import Token from "markdown-it/lib/token.mjs"
import type { BundledLanguage, Highlighter, ThemedToken } from "shiki"
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

      if (first && first.type === "table_open") {
        return splitTableGroup(group, md, env)
      }

      const [startLine, endLine] = lineRange(group)
      const fence = group.length === 1 && group[0].type === "fence" ? group[0] : null

      if (fence && fence.info.trim().toLowerCase().startsWith("mermaid")) {
        return [{ startLine, endLine, kind: "mermaid", tag: "", lang: "mermaid", html: renderMermaid(fence.content) }]
      }

      if (fence) {
        const lang = resolveLang(fence.info)
        await ensureLang(highlighter, lang)
        return splitCodeFence(fence, highlighter, shiki)
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

/**
 * Splits a table token group into one `RenderedBlock` per `<tr>` so each row is
 * independently anchorable. The header row becomes its own block (kept visible
 * as the table's context) and every body row another. Each block re-emits a
 * standalone single-row `<table>` carrying a shared equal-width `<colgroup>` and
 * `table-layout:fixed`, so the columns line up across the separate row tables;
 * `border-collapse` plus a `-1px` top margin on the trailing rows merges the
 * cell borders back into one continuous grid. Cell alignment styles emitted by
 * markdown-it are preserved since each `<tr>` is rendered from its own tokens.
 */
function splitTableGroup(group: Token[], md: MarkdownIt, env: AssetEnv): RenderedBlock[] {
  const cols = group.filter((t) => t.type === "th_open").length || 1
  const colgroup = colgroupHtml(cols)
  const blocks: RenderedBlock[] = []
  let section: "thead" | "tbody" = "tbody"
  let first = true

  for (let i = 0; i < group.length; i++) {
    const t = group[i]
    if (t.type === "thead_open") section = "thead"
    else if (t.type === "tbody_open") section = "tbody"
    if (t.type !== "tr_open") continue

    const close = matchClose(group, i)
    const row = group.slice(i, close + 1)
    const [startLine, endLine] = lineRange(row)
    const style = `table-layout:fixed${first ? "" : ";margin-top:-1px"}`
    const inner = md.renderer.render(row, md.options, env)
    blocks.push({
      startLine,
      endLine,
      kind: "markdown",
      tag: "tr",
      lang: null,
      html: `<table style="${style}">${colgroup}<${section}>${inner}</${section}></table>`
    })
    first = false
    i = close
  }

  return blocks
}

/** An equal-width `<colgroup>` so split row tables share identical column widths. */
function colgroupHtml(cols: number): string {
  const width = (100 / cols).toFixed(4)
  return `<colgroup>${`<col style="width:${width}%">`.repeat(cols)}</colgroup>`
}

/**
 * Splits a fenced code block into one `RenderedBlock` per source line so code
 * review can anchor a comment to a single line, reusing the raw view's
 * per-line Shiki tokenization (`codeToTokens`). The first and last line carry
 * the rounded corners, vertical padding, and top/bottom border; intermediate
 * lines share the side borders and theme background so the lines stack back
 * into one continuous code block. Each line's source line number is derived
 * from the fence's opening line so anchors map to the real file lines.
 */
function splitCodeFence(fence: Token, highlighter: Highlighter, shiki: string): RenderedBlock[] {
  const lang = resolveLang(fence.info)
  const code = fence.content.replace(/\n$/, "")
  const { tokens, fg = "inherit", bg = "var(--code-bg)" } = highlighter.codeToTokens(code, {
    lang: lang as BundledLanguage,
    theme: shiki
  })
  // fence.map is [openFenceLine, closeFenceLine+1] (0-based); the first content
  // line sits one line below the opening fence, +1 again for 1-based output.
  const base = (fence.map?.[0] ?? 0) + 2
  const last = tokens.length - 1

  return tokens.map((line, i) => {
    const startLine = base + i
    return {
      startLine,
      endLine: startLine,
      kind: "code",
      tag: "",
      lang,
      html: codeLineHtml(line, { fg, bg, first: i === 0, last: i === last })
    }
  })
}

/** One code line as a `<div>` of Shiki-colored spans, with edge chrome flags. */
function codeLineHtml(
  tokens: ThemedToken[],
  opts: { fg: string; bg: string; first: boolean; last: boolean }
): string {
  const spans =
    tokens.length === 0
      ? " "
      : tokens.map((t) => `<span style="${tokenCss(t)}">${escapeHtml(t.content)}</span>`).join("")
  const style = [
    `background:${opts.bg}`,
    `color:${opts.fg}`,
    "font-family:var(--mono)",
    "font-size:0.86rem",
    "line-height:1.6",
    "white-space:pre",
    "overflow-x:auto",
    "padding:0 1em",
    "border-left:1px solid var(--line-soft)",
    "border-right:1px solid var(--line-soft)",
    opts.first ? "padding-top:0.85em" : "",
    opts.first ? "border-top:1px solid var(--line-soft)" : "",
    opts.first ? "border-top-left-radius:8px;border-top-right-radius:8px" : "",
    opts.last ? "padding-bottom:0.85em" : "",
    opts.last ? "border-bottom:1px solid var(--line-soft)" : "",
    opts.last ? "border-bottom-left-radius:8px;border-bottom-right-radius:8px" : ""
  ]
    .filter(Boolean)
    .join(";")
  return `<div class="md-codeline" style="${style}">${spans}</div>`
}

/** Shiki encodes font style as a bitmask (1 italic, 2 bold, 4 underline). */
function tokenCss(token: ThemedToken): string {
  const parts = [`color:${token.color}`]
  const fontStyle = token.fontStyle ?? 0
  if (fontStyle & 1) parts.push("font-style:italic")
  if (fontStyle & 2) parts.push("font-weight:bold")
  if (fontStyle & 4) parts.push("text-decoration:underline")
  return parts.join(";")
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
}

/** Escapes the HTML-significant characters in a code token's literal text. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch] ?? ch)
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
