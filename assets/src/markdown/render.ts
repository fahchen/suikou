import MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"

import { THEME_CODE, type ThemeName } from "../themes"
import { getHighlighter, resolveLang } from "./highlighter"
import { renderMermaid } from "./mermaid"

export type BlockKind = "markdown" | "code" | "mermaid"

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

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

/**
 * Parses markdown into top-level blocks, each carrying its source line range so
 * the editor can render a line gutter and anchor comments. Code fences are
 * highlighted with Shiki; ```mermaid fences render to inline SVG.
 */
export async function renderMarkdown(content: string, theme: ThemeName): Promise<RenderedBlock[]> {
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
