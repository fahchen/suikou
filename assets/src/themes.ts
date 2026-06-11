export const THEMES = [
  "github",
  "solarized",
  "catppuccin",
  "gruvbox",
  "tokyo-day",
  "tokyo",
  "tokyo-storm",
  "tokyo-moon",
  "dracula",
  "nord",
  "onedark",
  "catppuccin-mocha",
  "rose-pine"
] as const

export type ThemeName = (typeof THEMES)[number]

export const THEME_LABELS: Record<ThemeName, string> = {
  github: "GitHub Light",
  solarized: "Solarized Light",
  catppuccin: "Catppuccin Latte",
  gruvbox: "Gruvbox Light",
  "tokyo-day": "Tokyo Night Day",
  tokyo: "Tokyo Night",
  "tokyo-storm": "Tokyo Night Storm",
  "tokyo-moon": "Tokyo Night Moon",
  dracula: "Dracula",
  nord: "Nord",
  onedark: "One Dark Pro",
  "catppuccin-mocha": "Catppuccin Mocha",
  "rose-pine": "Rosé Pine"
}

/**
 * Maps each UI theme to its Shiki syntax theme; `dark` drives Mermaid's darkMode.
 * Shiki ships no separate Storm/Moon/Day grammars, so those reuse `tokyo-night`
 * (dark) or `one-light` (the Day variant). Keep `dark` in sync with the
 * `@custom-variant dark` selector list in index.css.
 */
export const THEME_CODE: Record<ThemeName, { shiki: string; dark: boolean }> = {
  github: { shiki: "github-light", dark: false },
  solarized: { shiki: "solarized-light", dark: false },
  catppuccin: { shiki: "catppuccin-latte", dark: false },
  gruvbox: { shiki: "gruvbox-light-medium", dark: false },
  "tokyo-day": { shiki: "one-light", dark: false },
  tokyo: { shiki: "tokyo-night", dark: true },
  "tokyo-storm": { shiki: "tokyo-night", dark: true },
  "tokyo-moon": { shiki: "tokyo-night", dark: true },
  dracula: { shiki: "dracula", dark: true },
  nord: { shiki: "nord", dark: true },
  onedark: { shiki: "one-dark-pro", dark: true },
  "catppuccin-mocha": { shiki: "catppuccin-mocha", dark: true },
  "rose-pine": { shiki: "rose-pine", dark: true }
}

/** Unique Shiki themes to preload (several UI themes share one grammar). */
export const SHIKI_THEMES = [...new Set(THEMES.map((t) => THEME_CODE[t].shiki))]
