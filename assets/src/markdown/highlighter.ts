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
  "markdown",
  "gherkin"
]

/** File extension (no dot, lowercase) to the Shiki language that highlights it. */
const RAW_EXTENSIONS: Record<string, string> = {
  ex: "elixir",
  exs: "elixir",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  html: "html",
  htm: "html",
  css: "css",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  diff: "diff",
  patch: "diff",
  feature: "gherkin"
}

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

/** Resolves a file path to the Shiki language for raw highlighting, or null. */
export function shikiLangForPath(path: string): string | null {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return null
  return RAW_EXTENSIONS[path.slice(dot + 1).toLowerCase()] ?? null
}
