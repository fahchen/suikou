import { useEffect, type RefObject } from "react"

// Diagram colors bound to live theme CSS variables, so a theme switch restyles
// the SVG without re-rendering. `transparent` lets the diagram blend into the
// document background instead of painting its own surface.
const COLORS = {
  bg: "var(--color-surface)",
  fg: "var(--color-ink)",
  muted: "var(--color-muted)",
  accent: "var(--color-accent)",
  line: "var(--color-muted)",
  border: "var(--color-hair-strong)",
  surface: "var(--color-surface)",
  transparent: true,
} as const

/**
 * Hydrate any `.mermaid-diagram` placeholders inside `ref` into SVG, lazily
 * importing `beautiful-mermaid` on first use. Re-runs when `deps` change (the
 * host re-injects fresh placeholders on new markdown). Rendered nodes are
 * marked so a repeat pass skips them.
 */
export function useMermaid(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(".mermaid-diagram[data-mermaid]:not([data-rendered])"),
    )
    if (nodes.length === 0) return

    let cancelled = false
    void import("beautiful-mermaid").then(({ renderMermaidSVGAsync }) => {
      for (const node of nodes) {
        node.dataset.rendered = "1"
        renderMermaidSVGAsync(node.dataset.mermaid ?? "", COLORS)
          .then((svg) => {
            if (!cancelled) node.innerHTML = svg
          })
          .catch(() => {
            if (!cancelled) node.textContent = "Failed to render Mermaid diagram"
          })
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
