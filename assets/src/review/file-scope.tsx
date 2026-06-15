import { createContext, useContext, type ReactNode } from "react"

/**
 * Identifies which stacked file a gutter/composer belongs to when the
 * all-files display mode renders many file views side by side. `null` is the
 * legacy single-file mode and matches `uiStore.composerFilePath` defaults.
 */
const FileScopeContext = createContext<string | null>(null)

export function FileScopeProvider(props: {
  filePath: string
  children: ReactNode
}) {
  return (
    <FileScopeContext.Provider value={props.filePath}>
      {props.children}
    </FileScopeContext.Provider>
  )
}

export function useFileScope(): string | null {
  return useContext(FileScopeContext)
}
