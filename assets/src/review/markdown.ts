import { markdown } from "./markdown/engine"
import { parseFrontmatter } from "./markdown/frontmatter"

export { renderMarkdownBlocks } from "./markdown/blocks"
export type { MarkdownBlock } from "./markdown/types"

/** Render a comment or reply body to sanitized HTML. */
export function renderMarkdown(source: string): string {
  return markdown.render(source)
}

/** Extract the heading outline used by the Markdown table of contents. */
export function markdownToc(
  source: string,
): { level: number; text: string; line: number }[] {
  // Blank a leading frontmatter fence so its `key:` lines are not read as a
  // setext heading and leaked into the outline.
  const front = parseFrontmatter(source)
  const tokens = markdown.parse(front ? front.blanked : source, {})
  const items: { level: number; text: string; line: number }[] = []

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type !== "heading_open" || !token.map) continue

    const text = tokens[index + 1]?.content ?? ""
    if (text) {
      items.push({
        level: Number(token.tag.slice(1)),
        text,
        line: token.map[0] + 1,
      })
    }
  }

  return items
}
