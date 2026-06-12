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
  return buildOutline(tree.rootNode, content.split("\n"), lang)
}

/**
 * Walks a parsed tree into outline items. Nesting depth comes from the number of
 * heading ancestors, so headings nest by their position in the tree rather than
 * a fixed per-type level.
 */
export function buildOutline(root: Parser.SyntaxNode, lines: string[], lang: Lang): OutlineItem[] {
  const items: OutlineItem[] = []

  const visit = (node: Parser.SyntaxNode, depth: number): void => {
    const heading = isHeading(lang, node)
    const nextDepth = heading ? depth + 1 : depth
    if (heading) {
      const row = lang === "gherkin" ? titleRow(node) : node.startPosition.row
      items.push({ level: nextDepth, text: label(lines, row), line: row + 1 })
    }
    for (const child of node.namedChildren) visit(child, nextDepth)
  }
  visit(root, 0)

  return items
}

const ELIXIR_DEFS = new Set([
  "defmodule",
  "defprotocol",
  "defimpl",
  "def",
  "defp",
  "defmacro",
  "defmacrop",
  "defstruct",
  "describe",
  "test"
])

/**
 * Node types that count as an outline heading. Nesting depth is derived from how
 * many heading ancestors a node has, so these carry no fixed level.
 */
const HEADING_TYPES: Partial<Record<Lang, Set<string>>> = {
  typescript: new Set([
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "function_declaration",
    "method_definition"
  ]),
  python: new Set(["class_definition", "function_definition"]),
  rust: new Set(["mod_item", "struct_item", "enum_item", "trait_item", "impl_item", "function_item"]),
  go: new Set(["function_declaration", "method_declaration", "type_declaration"]),
  bash: new Set(["function_definition"]),
  gherkin: new Set(["feature", "rule", "background", "scenario", "examples"])
}

/** Whether a node opens an outline heading. */
function isHeading(lang: Lang, node: Parser.SyntaxNode): boolean {
  if (lang === "elixir") {
    if (node.type !== "call") return false
    const head = node.firstNamedChild
    return head?.type === "identifier" && ELIXIR_DEFS.has(head.text)
  }
  if (lang === "tsx" || lang === "javascript") {
    return HEADING_TYPES.typescript?.has(node.type) ?? false
  }
  return HEADING_TYPES[lang]?.has(node.type) ?? false
}

/**
 * The source row carrying a Gherkin heading's title. The grammar wraps a
 * heading's tags ahead of its keyword line, so the node's own start row can land
 * on a `@tag` line; the title lives on the nearest `*_line` descendant instead.
 */
function titleRow(node: Parser.SyntaxNode): number {
  return (firstLineNode(node) ?? node).startPosition.row
}

// Every Gherkin heading rule emits its own `*_line` as the first element of its
// sequence, ahead of any nested heading or step, so first-match DFS returns the
// node's own title line and never crosses into a child heading.
function firstLineNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (const child of node.namedChildren) {
    if (child.type.endsWith("_line")) return child
    const nested = firstLineNode(child)
    if (nested) return nested
  }
  return null
}

/** A compact label from the node's opening source line. */
function label(lines: string[], row: number): string {
  const raw = (lines[row] ?? "").trim().replace(/\s*(\{|\bdo\b|:)\s*$/, "")
  return raw.length > 72 ? `${raw.slice(0, 71)}…` : raw
}
