import { markdown } from "./engine"
import {
  findClose,
  sourceRange,
  type MarkdownToken,
  type MarkdownTokens,
} from "./token-utils"
import type { MarkdownBlock } from "./types"

type ListTag = "ol" | "ul"
type TokenRange = { start: number; end: number }

/** Render every list item, at every depth, as an independent comment block. */
export function renderListBlocks(
  tokens: MarkdownTokens,
  listOpen: number,
  listClose: number,
  env: Record<string, unknown>,
): MarkdownBlock[] {
  return renderItems(
    tokens,
    listOpen,
    listClose,
    env,
    listTag(tokens[listOpen]),
    listStart(tokens[listOpen]),
    0,
  )
}

function renderItems(
  tokens: MarkdownTokens,
  start: number,
  end: number,
  env: Record<string, unknown>,
  tag: ListTag,
  startNumber: number,
  depth: number,
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let itemIndex = 0

  for (let index = start + 1; index < end; index++) {
    const itemOpen = tokens[index]
    if (itemOpen.type !== "list_item_open" || itemOpen.nesting !== 1) continue

    const itemCloseIndex = findClose(tokens, index)
    if (itemCloseIndex === -1) continue
    const itemClose = tokens[itemCloseIndex]
    const itemNumber = startNumber + itemIndex
    const nestedLists = directNestedLists(tokens, index, itemCloseIndex)
    itemIndex += 1

    if (nestedLists.length === 0) {
      blocks.push(renderWholeItem(tokens, index, itemCloseIndex, env, tag, itemNumber, depth))
      index = itemCloseIndex
      continue
    }

    let cursor = index + 1
    let firstOwnSegment = true
    for (const nested of nestedLists) {
      const ownBlock = renderOwnSegment(
        tokens.slice(cursor, nested.start),
        env,
        tag,
        itemNumber,
        depth,
        itemOpen,
        itemClose,
        firstOwnSegment,
      )
      if (ownBlock) {
        blocks.push(ownBlock)
        firstOwnSegment = false
      }

      blocks.push(
        ...renderItems(
          tokens,
          nested.start,
          nested.end,
          env,
          listTag(tokens[nested.start]),
          listStart(tokens[nested.start]),
          depth + 1,
        ),
      )
      cursor = nested.end + 1
    }

    const trailingBlock = renderOwnSegment(
      tokens.slice(cursor, itemCloseIndex),
      env,
      tag,
      itemNumber,
      depth,
      itemOpen,
      itemClose,
      firstOwnSegment,
    )
    if (trailingBlock) blocks.push(trailingBlock)
    index = itemCloseIndex
  }

  return blocks
}

function renderWholeItem(
  tokens: MarkdownTokens,
  itemOpen: number,
  itemClose: number,
  env: Record<string, unknown>,
  tag: ListTag,
  itemNumber: number,
  depth: number,
): MarkdownBlock {
  const token = tokens[itemOpen]
  const html = markdown.renderer.render(tokens.slice(itemOpen, itemClose + 1), markdown.options, env)
  const line = (token.map?.[0] ?? 0) + 1
  return {
    line,
    endLine: token.map?.[1] ?? line,
    html: wrapListItem(html, tag, itemNumber, depth),
  }
}

function renderOwnSegment(
  segment: MarkdownToken[],
  env: Record<string, unknown>,
  tag: ListTag,
  itemNumber: number,
  depth: number,
  itemOpen: MarkdownToken,
  itemClose: MarkdownToken,
  first: boolean,
): MarkdownBlock | null {
  const range = sourceRange(segment)
  if (!range) return null

  if (first) {
    const html = markdown.renderer.render([itemOpen, ...segment, itemClose], markdown.options, env)
    return { ...range, html: wrapListItem(html, tag, itemNumber, depth) }
  }

  const html = markdown.renderer.render(segment, markdown.options, env)
  const padding = 1.3 * (depth + 1)
  return {
    ...range,
    html: `<div class="md-list-continuation" style="padding-left:${padding}em">${html}</div>`,
  }
}

function directNestedLists(
  tokens: MarkdownTokens,
  itemOpen: number,
  itemClose: number,
): TokenRange[] {
  const ranges: TokenRange[] = []
  let depth = 0

  for (let index = itemOpen + 1; index < itemClose; index++) {
    const token = tokens[index]
    if (depth === 0 && isListOpen(token)) {
      const end = findClose(tokens, index)
      if (end !== -1) {
        ranges.push({ start: index, end })
        index = end
        continue
      }
    }
    depth += token.nesting
  }

  return ranges
}

function wrapListItem(
  html: string,
  tag: ListTag,
  itemNumber: number,
  depth: number,
): string {
  const start = tag === "ol" ? ` start="${itemNumber}"` : ""
  const padding = 1.3 * (depth + 1)
  return `<${tag} class="md-list-item" style="padding-left:${padding}em"${start}>${html}</${tag}>`
}

function isListOpen(token: MarkdownToken): boolean {
  return token.type === "bullet_list_open" || token.type === "ordered_list_open"
}

function listTag(token: MarkdownToken): ListTag {
  return token.type === "ordered_list_open" ? "ol" : "ul"
}

function listStart(token: MarkdownToken): number {
  return Number(token.attrGet("start") ?? 1)
}
