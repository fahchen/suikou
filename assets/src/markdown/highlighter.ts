import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki"

import { SHIKI_THEMES } from "../themes"

// Languages we offer grammars for. Grammars are *not* loaded up front: each is
// dynamically imported by `ensureLang` on first use, so a view only pays for the
// grammars it actually renders instead of all of them on the first highlight.
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
] satisfies readonly BundledLanguage[]

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

const SUPPORTED = new Set<string>(LANGS)

let instance: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!instance) {
    instance = createHighlighter({ themes: SHIKI_THEMES, langs: [] })
  }
  return instance
}

/**
 * Loads `lang`'s grammar into the highlighter on first use. No-op when the
 * grammar is already loaded or `lang` is unsupported (plaintext). Must be awaited
 * before a synchronous `codeToHtml`/`codeToTokens` call for that language.
 */
export async function ensureLang(highlighter: Highlighter, lang: string): Promise<void> {
  if (!SUPPORTED.has(lang)) return
  if (highlighter.getLoadedLanguages().includes(lang)) return
  await highlighter.loadLanguage(lang as BundledLanguage)
}

/** Resolves a fence info string to a supported language, falling back to plaintext. */
export function resolveLang(info: string): string {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ""
  return SUPPORTED.has(lang) ? lang : "text"
}

/** Resolves a file path to the Shiki language for raw highlighting, or null. */
export function shikiLangForPath(path: string): string | null {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return null
  return RAW_EXTENSIONS[path.slice(dot + 1).toLowerCase()] ?? null
}
