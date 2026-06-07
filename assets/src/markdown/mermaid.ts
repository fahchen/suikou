import mermaid from "mermaid"

let configured: "default" | "dark" | null = null
let counter = 0

/**
 * Renders a Mermaid diagram source to an SVG string. Reinitializes Mermaid only
 * when the base theme changes. Returns an error marker (never throws) so one bad
 * diagram cannot break the whole document render.
 */
export async function renderMermaid(source: string, theme: "default" | "dark"): Promise<string> {
  if (configured !== theme) {
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" })
    configured = theme
  }

  const id = `mermaid-${counter++}`

  try {
    const { svg } = await mermaid.render(id, source)
    return svg
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
