import { assetUrl } from "./urls"

const PREVIEWABLE_EXTENSIONS = new Set([".md", ".markdown"])
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".bmp",
  ".ico"
])

/** Lowercased extension including the dot (".md"), or "" when there is none. */
function extname(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot === -1 ? "" : path.slice(dot).toLowerCase()
}

/** Whether a file has a rendered preview (markdown); every other type is raw-only. */
export function isPreviewable(path: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(extname(path))
}

/** Whether a file is a browser-displayable image, shown via the asset route. */
export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path))
}

/**
 * The asset-route URL for an image artifact's own file, or undefined when the
 * artifact isn't a displayable image. The artifact's bytes are served by name
 * relative to its own directory, so `dirname/basename` round-trips to file_path.
 */
export function imageAssetSrc(artifactId: string, title: string): string | undefined {
  if (!isImagePath(title)) return undefined
  return assetUrl(artifactId, title.slice(title.lastIndexOf("/") + 1))
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
