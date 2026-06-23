import { createContext, useContext, type ReactNode } from "react"

/**
 * Identifies which file a gutter/composer's draft belongs to. The value is
 * namespaced by the current artifact so the same file path reviewed under two
 * different artifacts (or reviews) keeps independent drafts — the bare path
 * alone would collide across reviews, and in single-file mode would collapse
 * every file onto one shared key. `null` means no provider is mounted.
 */
const FileScopeContext = createContext<string | null>(null)

/** Composes the artifact-namespaced draft key for a file path. */
export function fileScopeKey(artifactId: string, filePath: string): string {
  return `${artifactId}:${filePath}`
}

export function FileScopeProvider(props: {
  artifactId: string
  filePath: string
  children: ReactNode
}) {
  return (
    <FileScopeContext.Provider value={fileScopeKey(props.artifactId, props.filePath)}>
      {props.children}
    </FileScopeContext.Provider>
  )
}

export function useFileScope(): string | null {
  return useContext(FileScopeContext)
}
