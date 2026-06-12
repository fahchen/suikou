/** Backend routes for an artifact's live content and the assets it references. */

const base = (artifactId: string) => `/api/review/${artifactId}`

/** The artifact's own reviewed source file. */
export const contentUrl = (artifactId: string) => `${base(artifactId)}/content`

/** Prefix the markdown renderer resolves relative image `src`es against. */
export const assetBase = (artifactId: string) => `${base(artifactId)}/asset`

/** A specific project-relative asset under the artifact, path-segment encoded. */
export const assetUrl = (artifactId: string, relPath: string) =>
  `${assetBase(artifactId)}/${relPath.split("/").map(encodeURIComponent).join("/")}`
