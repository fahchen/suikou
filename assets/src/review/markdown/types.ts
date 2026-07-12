export type MarkdownBlock = {
  line: number
  endLine: number
  html: string
  /** Heading level (1-6) when this block is a heading, for collapsible sections. */
  heading?: number
}
