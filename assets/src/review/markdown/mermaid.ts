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

// DOMPurify strips any attribute whose value carries a newline, so the raw
// (multi-line) fence text can't ride in `data-mermaid` unencoded. Base64 keeps
// the whole diagram source in one newline-free attribute value; encode is UTF-8
// safe so CJK labels survive the round trip.
export function encodeMermaidSource(source: string): string {
  const bytes = new TextEncoder().encode(source)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeMermaidSource(encoded: string): string {
  if (encoded === "") return ""
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// Replace the placeholder with a visible error at the diagram's position, so a
// broken diagram surfaces the reason and its source instead of a blank gap.
// textContent (not innerHTML) escapes the lib message and user source, so a
// diagram body can't inject markup.
function showError(node: HTMLElement, source: string, error: unknown): void {
  const box = document.createElement("div")
  box.className =
    "mermaid-error rounded-[8px] bg-type-fix-soft px-3 py-2 text-left text-xs text-type-fix ring-1 ring-type-fix-edge"
  const title = document.createElement("div")
  title.className = "font-semibold"
  title.textContent = "Mermaid render failed"
  const message = document.createElement("div")
  message.className = "mt-1 opacity-80"
  message.textContent = error instanceof Error ? error.message : String(error)
  const pre = document.createElement("pre")
  pre.className = "mt-2 overflow-x-auto whitespace-pre font-mono text-2xs text-muted"
  pre.textContent = source
  box.append(title, message, pre)
  node.replaceChildren(box)
}

/**
 * Hydrate any `.mermaid-diagram` placeholders inside `ref` into SVG, lazily
 * importing `beautiful-mermaid` on first use. Re-runs when `deps` change (the
 * host re-injects fresh placeholders on new markdown). Rendered nodes are
 * marked so a repeat pass skips them; a failed render shows the error in place.
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
        const source = decodeMermaidSource(node.dataset.mermaid ?? "")
        renderMermaidSVGAsync(source, COLORS)
          .then((svg) => {
            if (!cancelled) node.innerHTML = svg
          })
          .catch((error) => {
            if (!cancelled) showError(node, source, error)
          })
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
