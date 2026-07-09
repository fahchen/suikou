import { markdown } from "./engine"
import { renderListBlocks } from "./list-blocks"
import { renderTableBlocks } from "./table-blocks"
import { findClose } from "./token-utils"
import type { MarkdownBlock } from "./types"

export type { MarkdownBlock } from "./types"

/** Split a document into source-mapped blocks used by preview comment gutters. */
export function renderMarkdownBlocks(source: string): MarkdownBlock[] {
  const env = {}
  const tokens = markdown.parse(source, env)
  const blocks: MarkdownBlock[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]

    if (token.type === "table_open") {
      const close = findClose(tokens, index)
      if (close !== -1) {
        blocks.push(...renderTableBlocks(tokens, index, close, env))
        index = close
        start = index + 1
        depth = 0
        continue
      }
    }

    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const close = findClose(tokens, index)
      if (close !== -1) {
        blocks.push(...renderListBlocks(tokens, index, close, env))
        index = close
        start = index + 1
        depth = 0
        continue
      }
    }

    if (depth === 0) start = index
    depth += token.nesting
    if (depth !== 0) continue

    const first = tokens[start]
    const html = markdown.renderer.render(tokens.slice(start, index + 1), markdown.options, env)
    if (!html.trim()) continue

    const line = first.map ? first.map[0] + 1 : 1
    blocks.push({ line, endLine: first.map ? first.map[1] : line, html })
  }

  return blocks
}
