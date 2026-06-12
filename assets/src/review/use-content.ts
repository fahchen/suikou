import { useEffect, useState } from "react"

import { contentUrl } from "./urls"

export interface ContentState {
  text: string
  loading: boolean
  error: string | null
}

/**
 * Fetches an artifact's reviewed source text live from the backend content
 * route. Content is no longer carried in the Musubi snapshot. `revision` is the
 * round's content hash, so the fetch re-runs whenever the file changes (a new
 * round or an in-place re-snapshot); `enabled` is false for image artifacts,
 * which are shown via `<img>` instead of fetched as text.
 */
export function useContent(artifactId: string, revision: string, enabled: boolean): ContentState {
  const [state, setState] = useState<ContentState>({ text: "", loading: enabled, error: null })

  useEffect(() => {
    if (!enabled) {
      setState({ text: "", loading: false, error: null })
      return
    }

    let cancelled = false
    setState((prev) => ({ text: prev.text, loading: true, error: null }))

    fetch(contentUrl(artifactId))
      .then((res) => {
        if (!res.ok) throw new Error(`content unavailable (${res.status})`)
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setState({ text, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ text: "", loading: false, error: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [artifactId, revision, enabled])

  return state
}
