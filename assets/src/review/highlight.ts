import {
  bundledLanguages,
  createCssVariablesTheme,
  createHighlighter,
  type BundledLanguage,
  type ThemedToken,
} from "shiki"

// One theme-independent tokenization: the css-variables theme emits `var(--shiki-*)`
// colors, and shiki-themes.css maps those per [data-theme]. So switching the app
// theme re-skins highlighted code in pure CSS, with no re-highlight.
const cssTheme = createCssVariablesTheme({ name: "css-variables", variablePrefix: "--shiki-", fontStyle: true })

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null
function getHighlighter() {
  highlighterPromise ??= createHighlighter({ themes: [cssTheme], langs: [] })
  return highlighterPromise
}

const EXT_LANG: Record<string, string> = {
  ex: "elixir", exs: "elixir", heex: "elixir", eex: "elixir",
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "jsonc",
  md: "markdown", markdown: "markdown", mdx: "mdx", feature: "gherkin",
  css: "css", scss: "scss", less: "less", html: "html", xml: "xml", svg: "xml",
  sh: "shell", bash: "shell", zsh: "shell", fish: "fish",
  yml: "yaml", yaml: "yaml", toml: "toml",
  rs: "rust", go: "go", py: "python", rb: "ruby", ex_: "elixir",
  java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
  sql: "sql", graphql: "graphql", gql: "graphql", dockerfile: "docker", lua: "lua",
}

function langFor(ext: string): string {
  const key = ext.toLowerCase()
  return EXT_LANG[key] ?? (key in bundledLanguages ? key : "text")
}

/** Tokenize source into lines of themed tokens whose colors are `var(--shiki-*)`.
 * Loads the grammar on demand; an unknown/unsupported language renders as plain
 * text (still returns one token per line). */
export async function highlightLines(code: string, ext: string): Promise<ThemedToken[][]> {
  const highlighter = await getHighlighter()
  let lang = langFor(ext)
  if (lang !== "text" && !highlighter.getLoadedLanguages().includes(lang)) {
    if (lang in bundledLanguages) {
      try {
        await highlighter.loadLanguage(lang as keyof typeof bundledLanguages)
      } catch {
        lang = "text"
      }
    } else {
      lang = "text"
    }
  }
  return highlighter.codeToTokens(code, { lang: lang as BundledLanguage, theme: "css-variables" }).tokens
}
