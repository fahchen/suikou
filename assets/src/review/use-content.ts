import { useEffect, useState } from "react"

import { contentUrl, reviewFileContentUrl } from "./urls"

export interface ContentState {
  text: string
  loading: boolean
  error: string | null
  /** True when the backend answered 404 (deliberate placeholder, do not retry). */
  missing: boolean
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
    missing: false
  })

  useEffect(() => {
    if (url === null) {
      setState({ text: "", loading: false, error: null, missing: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ text: prev.text, loading: true, error: null, missing: false }))

    fetch(url)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setState({ text: "", loading: false, error: null, missing: true })
          return
        }
        if (!res.ok) throw new Error(`content unavailable (${res.status})`)
        const text = await res.text()
        if (!cancelled) setState({ text, loading: false, error: null, missing: false })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ text: "", loading: false, error: err.message, missing: false })
      })

    return () => {
      cancelled = true
    }
  }, [url, cacheKey])

  return state
}
