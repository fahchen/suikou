import { renderMermaidSVG } from "beautiful-mermaid"

/**
 * Renders a Mermaid diagram source to an SVG string, themed from the active
 * palette via live CSS variables. Returns an error marker (never throws) so one
 * bad diagram cannot break the whole render.
 */
export function renderMermaid(source: string): string {
  try {
    return renderMermaidSVG(source, {
      bg: "var(--editor-bg)",
      fg: "var(--text)",
      line: "var(--muted-foreground)",
      accent: "var(--blue)",
      muted: "var(--muted-foreground)",
      surface: "var(--tint)",
      border: "var(--line-strong)",
      transparent: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `<pre class="mermaid-error">Diagram error: ${escapeHtml(message)}</pre>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
