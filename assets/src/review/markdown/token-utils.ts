import { markdown } from "./engine"

export type MarkdownTokens = ReturnType<typeof markdown.parse>
export type MarkdownToken = MarkdownTokens[number]

/** Find the closing token matching an opening token. */
export function findClose(tokens: MarkdownTokens, openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < tokens.length; index++) {
    depth += tokens[index].nesting
    if (depth === 0 && index > openIndex) return index
  }
  return -1
}

/** Convert markdown-it's zero-based, end-exclusive token maps to source lines. */
export function sourceRange(tokens: MarkdownToken[]): { line: number; endLine: number } | null {
  const mapped = tokens.filter((token) => token.map)
  if (mapped.length === 0) return null

  return {
    line: Math.min(...mapped.map((token) => token.map![0] + 1)),
    endLine: Math.max(...mapped.map((token) => token.map![1])),
  }
}
