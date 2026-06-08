import mermaid from "mermaid"

import { THEME_CODE, type ThemeName } from "../themes"

let configured: ThemeName | null = null
let counter = 0

/**
 * Renders a Mermaid diagram source to an SVG string, themed from the active
 * palette. Reinitializes Mermaid only when the UI theme changes. Returns an
 * error marker (never throws) so one bad diagram cannot break the whole render.
 */
export async function renderMermaid(source: string, theme: ThemeName): Promise<string> {
  if (configured !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: paletteVariables(theme),
    })
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

const MONO_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

// Mermaid's base theme feeds these through khroma for color math, which cannot
// parse oklch(); resolve every token to rgb via a probe element first.
function paletteVariables(theme: ThemeName): Record<string, string> {
  const c = resolveTokens([
    "--editor-bg",
    "--text",
    "--heading",
    "--blue",
    "--blue-soft",
    "--tint",
    "--panel",
    "--line",
    "--line-strong",
    "--muted-foreground",
    "--amber-soft",
  ])

  return {
    darkMode: String(THEME_CODE[theme].dark),
    fontFamily: MONO_STACK,
    background: c["--editor-bg"],
    primaryColor: c["--blue-soft"],
    primaryTextColor: c["--text"],
    primaryBorderColor: c["--blue"],
    secondaryColor: c["--tint"],
    secondaryTextColor: c["--text"],
    secondaryBorderColor: c["--line-strong"],
    tertiaryColor: c["--panel"],
    tertiaryTextColor: c["--text"],
    tertiaryBorderColor: c["--line"],
    lineColor: c["--muted-foreground"],
    titleColor: c["--heading"],
    nodeTextColor: c["--text"],
    edgeLabelBackground: c["--editor-bg"],
    clusterBkg: c["--panel"],
    clusterBorder: c["--line"],
    noteBkgColor: c["--amber-soft"],
    noteTextColor: c["--text"],
    noteBorderColor: c["--line-strong"],
  }
}

function resolveTokens(names: string[]): Record<string, string> {
  const probe = document.createElement("span")
  probe.style.position = "absolute"
  probe.style.opacity = "0"
  probe.style.pointerEvents = "none"
  document.body.appendChild(probe)

  const out: Record<string, string> = {}
  for (const name of names) {
    // color-mix forces the oklch token into the sRGB space; getComputedStyle then
    // yields `color(srgb r g b)` floats, which we fold to rgb() for khroma.
    probe.style.color = `color-mix(in srgb, var(${name}), var(${name}))`
    out[name] = toRgb(getComputedStyle(probe).color)
  }

  probe.remove()
  return out
}

function toRgb(color: string): string {
  const m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color)
  if (!m) return color
  const ch = (v: string) => Math.round(Math.min(1, Math.max(0, Number(v))) * 255)
  return `rgb(${ch(m[1])}, ${ch(m[2])}, ${ch(m[3])})`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
