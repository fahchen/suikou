import { createContext, useContext, useState, type ReactNode } from "react"

/**
 * A render slot in the file card header. A body view (e.g. the HTML preview)
 * pushes its own controls — zoom, fullscreen — up into the sticky header so they
 * sit beside the render/raw toggle instead of floating over the content. The
 * controls' state stays inside the view; only the rendered node crosses up.
 *
 * The setter and the value live in separate contexts so a view can subscribe to
 * the stable setter without re-rendering (and looping) every time the node it
 * pushed changes. Both are null when no provider wraps the view, so a view
 * rendered standalone (tests, all-files stacked cards) keeps its controls inline.
 */
const HeaderControlsContext = createContext<ReactNode>(null)
const SetHeaderControlsContext = createContext<((node: ReactNode) => void) | null>(null)

export function HeaderSlotProvider(props: { children: ReactNode }) {
  const [controls, setControls] = useState<ReactNode>(null)
  return (
    <SetHeaderControlsContext.Provider value={setControls}>
      <HeaderControlsContext.Provider value={controls}>
        {props.children}
      </HeaderControlsContext.Provider>
    </SetHeaderControlsContext.Provider>
  )
}

/** The controls a body view has pushed up, for the header to render. */
export function useHeaderControls(): ReactNode {
  return useContext(HeaderControlsContext)
}

/** Stable setter to push controls into the header; null with no provider. */
export function useSetHeaderControls(): ((node: ReactNode) => void) | null {
  return useContext(SetHeaderControlsContext)
}
