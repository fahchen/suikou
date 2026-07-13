export type MarkdownBlock = {
  line: number
  endLine: number
  html: string
  /** Heading level (1-6) when this block is a heading, for collapsible sections. */
  heading?: number
  /** Fence id when this block is one line of a code block; groups lines that
   * share a horizontal scroll container. */
  codeGroup?: string
}
