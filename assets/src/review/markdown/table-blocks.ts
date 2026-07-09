import { markdown } from "./engine"
import { findClose, type MarkdownTokens } from "./token-utils"
import type { MarkdownBlock } from "./types"

/** Render a table as independently commentable header and data rows. */
export function renderTableBlocks(
  tokens: MarkdownTokens,
  tableOpen: number,
  tableClose: number,
  env: Record<string, unknown>,
): MarkdownBlock[] {
  const theadOpen = findToken(tokens, tableOpen, tableClose, "thead_open")
  const theadClose = findToken(tokens, tableOpen, tableClose, "thead_close")
  const tbodyOpen = findToken(tokens, tableOpen, tableClose, "tbody_open")
  const tbodyClose = findToken(tokens, tableOpen, tableClose, "tbody_close")
  const blocks: MarkdownBlock[] = []

  const headerHtml =
    theadOpen !== -1 && theadClose !== -1
      ? markdown.renderer.render(tokens.slice(theadOpen, theadClose + 1), markdown.options, env)
      : ""
  const headerRow = headerHtml.replace(/^<thead>\s*/, "").replace(/\s*<\/thead>\s*$/, "")
  const headers =
    theadOpen !== -1 && theadClose !== -1
      ? tokens
          .slice(theadOpen, theadClose + 1)
          .filter((token) => token.type === "inline")
          .map((token) => token.content)
      : []

  if (headerRow.trim()) {
    const token = tokens[theadOpen]
    const label = escapeAttribute(`Table columns: ${headers.join(", ")}`)
    blocks.push({
      line: (token.map?.[0] ?? 0) + 1,
      endLine: token.map?.[1] ?? (token.map?.[0] ?? 0) + 1,
      html: `<table class="md-table-block" aria-label="${label}"><thead>${headerRow}</thead></table>`,
    })
  }

  if (tbodyOpen === -1 || tbodyClose === -1) return blocks

  const rows = findRows(tokens, tbodyOpen, tbodyClose)
  rows.forEach((row, index) => {
    const token = tokens[row.open]
    const html = markdown.renderer.render(tokens.slice(row.open, row.close + 1), markdown.options, env)
    const label = escapeAttribute(
      `Table row ${index + 1} of ${rows.length}; columns: ${headers.join(", ")}`,
    )
    blocks.push({
      line: (token.map?.[0] ?? 0) + 1,
      endLine: token.map?.[1] ?? (token.map?.[0] ?? 0) + 1,
      html: `<table class="md-table-block md-table-row" aria-label="${label}"><tbody>${html}</tbody></table>`,
    })
  })

  return blocks
}

function findToken(
  tokens: MarkdownTokens,
  start: number,
  end: number,
  type: string,
): number {
  for (let index = start + 1; index < end; index++) {
    if (tokens[index].type === type) return index
  }
  return -1
}

function findRows(
  tokens: MarkdownTokens,
  tbodyOpen: number,
  tbodyClose: number,
): { open: number; close: number }[] {
  const rows: { open: number; close: number }[] = []
  for (let index = tbodyOpen + 1; index < tbodyClose; index++) {
    if (tokens[index].type !== "tr_open" || tokens[index].nesting !== 1) continue
    const close = findClose(tokens, index)
    if (close === -1) continue
    rows.push({ open: index, close })
    index = close
  }
  return rows
}

function escapeAttribute(value: string): string {
  return markdown.utils.escapeHtml(value)
}
