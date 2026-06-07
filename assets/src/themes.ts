export const THEMES = ["github", "solarized", "catppuccin", "gruvbox", "tokyo"] as const

export type ThemeName = (typeof THEMES)[number]

export const THEME_LABELS: Record<ThemeName, string> = {
  github: "GitHub Light",
  solarized: "Solarized Light",
  catppuccin: "Catppuccin Latte",
  gruvbox: "Gruvbox Light",
  tokyo: "Tokyo Night"
}

/** Maps each UI theme to its Shiki syntax theme and Mermaid base theme. */
export const THEME_CODE: Record<ThemeName, { shiki: string; mermaid: "default" | "dark"; dark: boolean }> = {
  github: { shiki: "github-light", mermaid: "default", dark: false },
  solarized: { shiki: "solarized-light", mermaid: "default", dark: false },
  catppuccin: { shiki: "catppuccin-latte", mermaid: "default", dark: false },
  gruvbox: { shiki: "gruvbox-light-medium", mermaid: "default", dark: false },
  tokyo: { shiki: "tokyo-night", mermaid: "dark", dark: true }
}

export const SHIKI_THEMES = THEMES.map((t) => THEME_CODE[t].shiki)
