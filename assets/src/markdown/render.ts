import MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import { full as emoji } from "markdown-it-emoji"
import footnote from "markdown-it-footnote"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"

import { THEME_CODE, type ThemeName } from "../themes"
import { getHighlighter, resolveLang } from "./highlighter"
import { renderMermaid } from "./mermaid"

export type BlockKind = "markdown" | "code" | "mermaid"

/** GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists) or strict CommonMark. */
export type MarkdownFlavor = "gfm" | "plain"

export interface RenderedBlock {
  /** 1-based, inclusive source line where the block begins. */
  startLine: number
  /** 1-based, inclusive source line where the block ends. */
  endLine: number
  html: string
  kind: BlockKind
  /** Top-level HTML tag for markdown blocks (`h2`, `p`, `ul`, `table`, …), else "". */
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
gfm.use(emoji).use(footnote).use(sub).use(sup)

/** Plain: strict CommonMark, no tables/strikethrough/autolinks/task lists. */
const plain = new MarkdownIt("commonmark", { html: false, typographer: true })

/**
 * Parses markdown into top-level blocks, each carrying its source line range so
 * the editor can render a line gutter and anchor comments. Code fences are
 * highlighted with Shiki; ```mermaid fences render to inline SVG. The `flavor`
 * selects GitHub Flavored Markdown (default) or strict CommonMark.
 */
export async function renderMarkdown(
  content: string,
  theme: ThemeName,
  flavor: MarkdownFlavor = "gfm"
): Promise<RenderedBlock[]> {
  const md = flavor === "plain" ? plain : gfm
  const tokens = md.parse(content, {})
  const groups = groupTopLevel(tokens)
  const { shiki } = THEME_CODE[theme]
  const highlighter = await getHighlighter()

  return Promise.all(
    groups.map(async (group): Promise<RenderedBlock> => {
      const [startLine, endLine] = lineRange(group)
      const fence = group.length === 1 && group[0].type === "fence" ? group[0] : null

      if (fence && fence.info.trim().toLowerCase().startsWith("mermaid")) {
        return { startLine, endLine, kind: "mermaid", tag: "", lang: "mermaid", html: renderMermaid(fence.content) }
      }

      if (fence) {
        const lang = resolveLang(highlighter, fence.info)
        const html = highlighter.codeToHtml(fence.content.replace(/\n$/, ""), { lang, theme: shiki })
        return { startLine, endLine, kind: "code", tag: "", lang, html }
      }

      return {
        startLine,
        endLine,
        kind: "markdown",
        tag: group[0]?.tag ?? "",
        lang: null,
        html: md.renderer.render(group, md.options, {})
      }
    })
  )
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
