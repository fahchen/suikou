import { createHighlighter, type Highlighter } from "shiki"

import { SHIKI_THEMES } from "../themes"

const LANGS = [
  "elixir",
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "json",
  "bash",
  "shell",
  "sql",
  "html",
  "css",
  "python",
  "rust",
  "go",
  "yaml",
  "toml",
  "diff",
  "markdown"
]

let instance: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!instance) {
    instance = createHighlighter({ themes: SHIKI_THEMES, langs: LANGS })
  }
  return instance
}

/** Resolves a fence info string to a loaded language, falling back to plaintext. */
export function resolveLang(highlighter: Highlighter, info: string): string {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ""
  return highlighter.getLoadedLanguages().includes(lang) ? lang : "text"
}
