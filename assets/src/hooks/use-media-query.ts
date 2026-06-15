import { useSyncExternalStore } from "react"

/** Subscribes to a CSS media query, re-rendering when its match state flips. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Tailwind `lg` breakpoint: the comment rail only earns its column here. */
export const WIDE_QUERY = "(min-width: 1024px)"

/** Below Tailwind `sm`: phone widths where popovers give way to full modals. */
export const MOBILE_QUERY = "(max-width: 639px)"
