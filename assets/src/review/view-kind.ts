import type { ReviewSnapshot } from "./types"

/**
 * What kind of view should render the current artifact. Keyed off the
 * server-supplied `artifact.kind` hint and (for the `"file"` kind) the path
 * extension. New kinds register a new entry in the view registry instead of
 * threading another conditional through the routes.
 */
export type ViewKind = "file" | "diff" | "html"

const HTML_EXTENSIONS = new Set([".html", ".htm"])

function extname(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot === -1 ? "" : path.slice(dot).toLowerCase()
}

/** Whether a path resolves to an HTML document (sandboxed iframe view). */
export function isHtmlPath(path: string): boolean {
  return HTML_EXTENSIONS.has(extname(path))
}

type ArtifactHint = Pick<ReviewSnapshot["artifact"], "kind" | "title">

/**
 * Map an artifact to its view kind. Diff-kind artifacts route to the diff view
 * regardless of file extension; otherwise `.html`/`.htm` route to the html view,
 * and everything else is a file view (markdown/image/raw).
 */
export function resolveViewKind(artifact: ArtifactHint): ViewKind {
  if (artifact.kind === "diff") return "diff"
  if (isHtmlPath(artifact.title)) return "html"
  return "file"
}
