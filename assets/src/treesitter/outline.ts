import Parser from "web-tree-sitter"

import coreWasmUrl from "web-tree-sitter/tree-sitter.wasm?url"

export interface OutlineItem {
  level: number
  text: string
  line: number
}

/**
 * Languages we can outline. Each maps to a Tree-sitter grammar wasm fetched on
 * demand the first time a file of that language is opened.
 */
export type Lang =
  | "elixir"
  | "typescript"
  | "tsx"
  | "javascript"
  | "json"
  | "python"
  | "rust"
  | "go"
  | "bash"
  | "yaml"
  | "css"
  | "html"
  | "gherkin"

const GRAMMAR_URL: Record<Lang, () => Promise<{ default: string }>> = {
  elixir: () => import("tree-sitter-wasms/out/tree-sitter-elixir.wasm?url"),
  typescript: () => import("tree-sitter-wasms/out/tree-sitter-typescript.wasm?url"),
  tsx: () => import("tree-sitter-wasms/out/tree-sitter-tsx.wasm?url"),
  javascript: () => import("tree-sitter-wasms/out/tree-sitter-javascript.wasm?url"),
  json: () => import("tree-sitter-wasms/out/tree-sitter-json.wasm?url"),
  python: () => import("tree-sitter-wasms/out/tree-sitter-python.wasm?url"),
  rust: () => import("tree-sitter-wasms/out/tree-sitter-rust.wasm?url"),
  go: () => import("tree-sitter-wasms/out/tree-sitter-go.wasm?url"),
  bash: () => import("tree-sitter-wasms/out/tree-sitter-bash.wasm?url"),
  yaml: () => import("tree-sitter-wasms/out/tree-sitter-yaml.wasm?url"),
  css: () => import("tree-sitter-wasms/out/tree-sitter-css.wasm?url"),
  html: () => import("tree-sitter-wasms/out/tree-sitter-html.wasm?url"),
  gherkin: () => import("./wasm/tree-sitter-gherkin.wasm?url")
}

const EXTENSIONS: Record<string, Lang> = {
  ex: "elixir",
  exs: "elixir",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  json: "json",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  css: "css",
  html: "html",
  htm: "html",
  feature: "gherkin"
}

/** Resolves a file path to a supported outline language, or null. */
export function langForPath(path: string): Lang | null {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return null
  return EXTENSIONS[path.slice(dot + 1).toLowerCase()] ?? null
}

let parserReady: Promise<Parser> | null = null
const languages = new Map<Lang, Promise<Parser.Language>>()

function getParser(): Promise<Parser> {
  if (!parserReady) {
    parserReady = Parser.init({ locateFile: () => coreWasmUrl }).then(() => new Parser())
  }
  return parserReady
}

function getLanguage(lang: Lang): Promise<Parser.Language> {
  let pending = languages.get(lang)
  if (!pending) {
    pending = GRAMMAR_URL[lang]().then(({ default: url }) => Parser.Language.load(url))
    languages.set(lang, pending)
  }
  return pending
}

/**
 * Parses source with the language's grammar and walks the tree for outline
 * items (modules, definitions, scenarios…), each carrying its 1-based source
 * line so the table of contents can anchor to the editor gutter.
 */
export async function outline(content: string, lang: Lang): Promise<OutlineItem[]> {
  const parser = await getParser()
  const language = await getLanguage(lang)
  parser.setLanguage(language)

  const tree = parser.parse(content)
  const lines = content.split("\n")
  const items: OutlineItem[] = []

  const visit = (node: Parser.SyntaxNode): void => {
    const level = levelOf(lang, node)
    if (level !== null) {
      items.push({ level, text: label(lines, node.startPosition.row), line: node.startPosition.row + 1 })
    }
    for (const child of node.namedChildren) visit(child)
  }
  visit(tree.rootNode)

  return items
}

const ELIXIR_DEFS: Record<string, number> = {
  defmodule: 1,
  defprotocol: 1,
  defimpl: 1,
  def: 2,
  defp: 2,
  defmacro: 2,
  defmacrop: 2,
  defstruct: 2,
  describe: 2,
  test: 2
}

const TYPES: Partial<Record<Lang, Record<string, number>>> = {
  typescript: {
    class_declaration: 1,
    abstract_class_declaration: 1,
    interface_declaration: 1,
    type_alias_declaration: 1,
    enum_declaration: 1,
    function_declaration: 1,
    method_definition: 2
  },
  python: { class_definition: 1, function_definition: 2 },
  rust: {
    mod_item: 1,
    struct_item: 1,
    enum_item: 1,
    trait_item: 1,
    impl_item: 1,
    function_item: 2
  },
  go: { function_declaration: 1, method_declaration: 1, type_declaration: 1 },
  bash: { function_definition: 1 },
  gherkin: {
    feature: 1,
    rule: 2,
    background: 2,
    scenario: 2,
    scenario_outline: 2,
    examples: 3
  }
}

/** The outline depth a node contributes, or null when it is not an item. */
function levelOf(lang: Lang, node: Parser.SyntaxNode): number | null {
  if (lang === "elixir") {
    if (node.type !== "call") return null
    const head = node.firstNamedChild
    if (head && head.type === "identifier") return ELIXIR_DEFS[head.text] ?? null
    return null
  }
  if (lang === "tsx" || lang === "javascript") {
    return TYPES.typescript?.[node.type] ?? null
  }
  return TYPES[lang]?.[node.type] ?? null
}

/** A compact label from the node's opening source line. */
function label(lines: string[], row: number): string {
  const raw = (lines[row] ?? "").trim().replace(/\s*(\{|\bdo\b|:)\s*$/, "")
  return raw.length > 72 ? `${raw.slice(0, 71)}…` : raw
}
