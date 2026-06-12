const PREVIEWABLE_EXTENSIONS = new Set([".md", ".markdown"])

/** Whether a file has a rendered preview (markdown); every other type is raw-only. */
export function isPreviewable(path: string): boolean {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return false
  return PREVIEWABLE_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

/**
 * Whether content is binary (an image or other non-text file) rather than
 * something worth showing as source. A NUL byte never appears in text; a high
 * share of U+FFFD replacement chars means the bytes weren't valid UTF-8. Both
 * mark content that can't render as either markdown or highlighted source.
 */
export function isBinaryContent(content: string): boolean {
  if (content.includes("\u0000")) return true
  const sample = content.slice(0, 1000)
  if (sample.length === 0) return false
  let replacements = 0
  for (const ch of sample) if (ch === "�") replacements++
  return replacements / sample.length > 0.1
}
