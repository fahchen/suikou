/** Backend routes for an artifact's live content and the assets it references. */

const base = (artifactId: string) => `/api/review/${artifactId}`

/** The artifact's own reviewed source file. */
export const contentUrl = (artifactId: string) => `${base(artifactId)}/content`

/** Prefix the markdown renderer resolves relative image `src`es against. */
export const assetBase = (artifactId: string) => `${base(artifactId)}/asset`

/** A specific project-relative asset under the artifact, path-segment encoded. */
export const assetUrl = (artifactId: string, relPath: string) =>
  `${assetBase(artifactId)}/${relPath.split("/").map(encodeURIComponent).join("/")}`

/**
 * Content of a review file looked up by repo-relative path, without minting
 * an artifact. Backend returns the same shape as `contentUrl(artifact_id)`:
 * file bytes for file-selection reviews, unified-diff text for git-diff.
 */
export const reviewFileContentUrl = (reviewId: string, relPath: string) =>
  `/api/review/${reviewId}/files/content?path=${encodeURIComponent(relPath)}`

/**
 * Raw bytes of a review file looked up by repo-relative path. Returns the file
 * with its detected Content-Type, so it can be used directly as `<img src>` for
 * previews — no minting required. 404s when the file is deleted at head or
 * isn't part of the review's file list.
 */
export const reviewFileRawUrl = (reviewId: string, relPath: string) =>
  `/api/review/${reviewId}/files/raw?path=${encodeURIComponent(relPath)}`
