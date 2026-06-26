import { useEffect, useState } from "react"

import { contentUrl, reviewFileContentUrl } from "./urls"

export interface ContentState {
  text: string
  loading: boolean
  error: string | null
  /** True when the backend answered 404 (deliberate placeholder, do not retry). */
  missing: boolean
  /** Strong ETag of the served bytes (hash of `text`), or "" when unavailable.
   * The highlight cache key, so it tracks the displayed content rather than a
   * possibly-stale snapshot hash. */
  etag: string
}

/**
 * Body shown when an artifact's source can't be found (the backend answered
 * 404) — the file was deleted or moved after the review was created.
 */
export const MISSING_CONTENT_MESSAGE =
  "It may have been deleted or moved since this review was created."

/**
 * Collapse a content fetch result into a single notice message for the view
 * layer: the friendly missing-file copy for a 404, the raw failure for any
 * other error, or null when the content is present. Keeps a deleted source from
 * rendering as a blank editor.
 */
export function contentErrorFrom(state: ContentState): string | null {
  if (state.missing) return MISSING_CONTENT_MESSAGE
  return state.error
}

/**
 * Fetches an artifact's reviewed source text live from the backend content
 * route. Content is no longer carried in the Musubi snapshot. `revision` is the
 * round's content hash, so the fetch re-runs whenever the file changes (a new
 * round or an in-place re-snapshot); `enabled` is false for image artifacts,
 * which are shown via `<img>` instead of fetched as text.
 */
export function useContent(artifactId: string, revision: string, enabled: boolean): ContentState {
  return useTextContent(enabled ? contentUrl(artifactId) : null, revision)
}

/**
 * Same shape as `useContent`, but looks the file up by repo-relative path
 * inside a review — the route the backend exposes for unminted rows. Pass
 * the row's `content_hash` as the cache key so the fetch re-runs only when
 * the file's version changes.
 */
export function useReviewFileContent(
  reviewId: string,
  path: string,
  contentHash: string | null,
  enabled: boolean
): ContentState {
  return useTextContent(enabled ? reviewFileContentUrl(reviewId, path) : null, contentHash ?? "")
}

function useTextContent(url: string | null, cacheKey: string): ContentState {
  const [state, setState] = useState<ContentState>({
    text: "",
    loading: url !== null,
    error: null,
    missing: false,
    etag: ""
  })

  useEffect(() => {
    if (url === null) {
      setState({ text: "", loading: false, error: null, missing: false, etag: "" })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null, missing: false }))

    fetch(url)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setState({ text: "", loading: false, error: null, missing: true, etag: "" })
          return
        }
        if (!res.ok) throw new Error(`content unavailable (${res.status})`)
        const text = await res.text()
        const etag = res.headers.get("etag") ?? ""
        if (!cancelled) setState({ text, loading: false, error: null, missing: false, etag })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ text: "", loading: false, error: err.message, missing: false, etag: "" })
      })

    return () => {
      cancelled = true
    }
  }, [url, cacheKey])

  return state
}
