const PREVIEWABLE_EXTENSIONS = new Set([".md", ".markdown"])

/** Whether a file has a rendered preview (markdown); every other type is raw-only. */
export function isPreviewable(path: string): boolean {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return false
  return PREVIEWABLE_EXTENSIONS.has(path.slice(dot).toLowerCase())
}
