export const THEMES = ["github", "solarized", "catppuccin", "gruvbox", "tokyo"] as const

export type ThemeName = (typeof THEMES)[number]

export const THEME_LABELS: Record<ThemeName, string> = {
  github: "GitHub Light",
  solarized: "Solarized Light",
  catppuccin: "Catppuccin Latte",
  gruvbox: "Gruvbox Light",
  tokyo: "Tokyo Night"
}

/** Maps each UI theme to its Shiki syntax theme; `dark` drives Mermaid's darkMode. */
export const THEME_CODE: Record<ThemeName, { shiki: string; dark: boolean }> = {
  github: { shiki: "github-light", dark: false },
  solarized: { shiki: "solarized-light", dark: false },
  catppuccin: { shiki: "catppuccin-latte", dark: false },
  gruvbox: { shiki: "gruvbox-light-medium", dark: false },
  tokyo: { shiki: "tokyo-night", dark: true }
}

export const SHIKI_THEMES = THEMES.map((t) => THEME_CODE[t].shiki)
