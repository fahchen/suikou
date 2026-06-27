import { useCallback, useEffect, useState } from "react"

/** True when the file changed on disk since the version the open content loaded at. */
export function diskStale(diskVersion: number, loadedVersion: number): boolean {
  return diskVersion > loadedVersion
}

/**
 * Tracks whether the displayed content is stale relative to the file's on-disk
 * `disk_version`. Marks the current version as loaded whenever the content
 * (`etag`) changes, so a fresh fetch clears the stale state. `refresh` forces a
 * refetch and clears the mark immediately.
 */
export function useDiskStale(
  diskVersion: number,
  etag: string,
  refetch: () => void
): { stale: boolean; refresh: () => void } {
  const [loaded, setLoaded] = useState(diskVersion)

  // New content arrived (etag changed): the displayed bytes are now current.
  useEffect(() => {
    setLoaded(diskVersion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etag])

  const refresh = useCallback(() => {
    setLoaded(diskVersion)
    refetch()
  }, [diskVersion, refetch])

  return { stale: diskStale(diskVersion, loaded), refresh }
}
