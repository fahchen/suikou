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

type ArtifactHint = { kind: "file" | "diff"; title: string }

/**
 * Map an artifact to its view kind. Diff-kind artifacts route to the diff view
 * regardless of file extension; otherwise `.html`/`.htm` route to the html view,
 * and everything else is a file view (markdown/image/source).
 */
export function resolveViewKind(artifact: ArtifactHint): ViewKind {
  if (artifact.kind === "diff") return "diff"
  if (isHtmlPath(artifact.title)) return "html"
  return "file"
}

/**
 * Per-artifact capability flags used by the topbar to gate controls. Each flag
 * is true only when the corresponding control is meaningful for the artifact at
 * hand — so irrelevant toggles disappear instead of sitting around inert.
 */
export interface ViewCapabilities {
  /** Diff layout toggle (unified vs side-by-side) — only for diff artifacts. */
  diffLayout: boolean
  /** Rendered/source toggle — only when the file has both a rendered preview and
   * a source view (markdown, html). */
  sourceToggle: boolean
  /** HTML comment/interact toggle — only for html; the header shows it only when
   * rendered (the source view has no interaction axis). */
  htmlInteraction: boolean
  /** Markdown flavor toggle — only for previewable files in rendered mode. */
  markdownFlavor: boolean
  /** Soft-wrap toggle — only for source text views (not images / diffs / html). */
  wrapLines: boolean
  /** Density (reading rhythm) — only meaningful for the markdown render view. */
  density: boolean
  /** Comment plumbing (mode toggle, status/type filters, collapse-all). */
  comments: boolean
}

interface CapabilityHint {
  kind: ViewKind
  previewable: boolean
  image: boolean
  sourceView: boolean
  binary: boolean
}

export function viewCapabilities(hint: CapabilityHint): ViewCapabilities {
  const { kind, previewable, image, sourceView, binary } = hint
  const fileKind = kind === "file"
  const htmlKind = kind === "html"
  return {
    diffLayout: kind === "diff",
    sourceToggle: (fileKind && previewable && !image && !binary) || htmlKind,
    htmlInteraction: htmlKind,
    markdownFlavor: fileKind && previewable && !sourceView && !image,
    wrapLines: fileKind && !image && !binary && (sourceView || !previewable),
    density: fileKind && previewable && !sourceView && !image,
    comments: !image && !binary
  }
}
