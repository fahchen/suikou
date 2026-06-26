import { Parser, Language, type Node } from "web-tree-sitter"

import coreWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url"

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
  | "c"
  | "cpp"
  | "c_sharp"
  | "java"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "lua"
  | "scala"
  | "sql"
  | "toml"

const GRAMMAR_URL: Record<Lang, () => Promise<{ default: string }>> = {
  elixir: () => import("./wasm/tree-sitter-elixir.wasm?url"),
  typescript: () => import("./wasm/tree-sitter-typescript.wasm?url"),
  tsx: () => import("./wasm/tree-sitter-tsx.wasm?url"),
  javascript: () => import("./wasm/tree-sitter-javascript.wasm?url"),
  json: () => import("./wasm/tree-sitter-json.wasm?url"),
  python: () => import("./wasm/tree-sitter-python.wasm?url"),
  rust: () => import("./wasm/tree-sitter-rust.wasm?url"),
  go: () => import("./wasm/tree-sitter-go.wasm?url"),
  bash: () => import("./wasm/tree-sitter-bash.wasm?url"),
  yaml: () => import("./wasm/tree-sitter-yaml.wasm?url"),
  css: () => import("./wasm/tree-sitter-css.wasm?url"),
  html: () => import("./wasm/tree-sitter-html.wasm?url"),
  gherkin: () => import("./wasm/tree-sitter-gherkin.wasm?url"),
  c: () => import("./wasm/tree-sitter-c.wasm?url"),
  cpp: () => import("./wasm/tree-sitter-cpp.wasm?url"),
  c_sharp: () => import("./wasm/tree-sitter-c_sharp.wasm?url"),
  java: () => import("./wasm/tree-sitter-java.wasm?url"),
  ruby: () => import("./wasm/tree-sitter-ruby.wasm?url"),
  php: () => import("./wasm/tree-sitter-php.wasm?url"),
  swift: () => import("./wasm/tree-sitter-swift.wasm?url"),
  kotlin: () => import("./wasm/tree-sitter-kotlin.wasm?url"),
  lua: () => import("./wasm/tree-sitter-lua.wasm?url"),
  scala: () => import("./wasm/tree-sitter-scala.wasm?url"),
  sql: () => import("./wasm/tree-sitter-sql.wasm?url"),
  toml: () => import("./wasm/tree-sitter-toml.wasm?url")
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
  feature: "gherkin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "c_sharp",
  java: "java",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  scala: "scala",
  sc: "scala",
  sql: "sql",
  toml: "toml"
}

/** Resolves a file path to a supported outline language, or null. */
export function langForPath(path: string): Lang | null {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return null
  return EXTENSIONS[path.slice(dot + 1).toLowerCase()] ?? null
}

let parserReady: Promise<Parser> | null = null
const languages = new Map<Lang, Promise<Language>>()

function getParser(): Promise<Parser> {
  if (!parserReady) {
    parserReady = Parser.init({ locateFile: () => coreWasmUrl }).then(() => new Parser())
  }
  return parserReady
}

function getLanguage(lang: Lang): Promise<Language> {
  let pending = languages.get(lang)
  if (!pending) {
    pending = GRAMMAR_URL[lang]().then(({ default: url }) => Language.load(url))
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
  if (!tree) return []
  return buildOutline(tree.rootNode, content.split("\n"), lang)
}

/**
 * Walks a parsed tree into outline items. Nesting depth comes from the number of
 * heading ancestors, so headings nest by their position in the tree rather than
 * a fixed per-type level.
 */
export function buildOutline(root: Node, lines: string[], lang: Lang): OutlineItem[] {
  const items: OutlineItem[] = []

  const visit = (node: Node, depth: number): void => {
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
  gherkin: new Set(["feature", "rule", "background", "scenario", "examples"]),
  c: new Set(["function_definition", "struct_specifier", "enum_specifier", "union_specifier"]),
  cpp: new Set([
    "class_specifier",
    "struct_specifier",
    "function_definition",
    "namespace_definition",
    "enum_specifier"
  ]),
  c_sharp: new Set([
    "namespace_declaration",
    "class_declaration",
    "interface_declaration",
    "struct_declaration",
    "record_declaration",
    "enum_declaration",
    "method_declaration"
  ]),
  java: new Set([
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration"
  ]),
  ruby: new Set(["module", "class", "method", "singleton_method"]),
  php: new Set([
    "class_declaration",
    "interface_declaration",
    "trait_declaration",
    "enum_declaration",
    "function_definition",
    "method_declaration"
  ]),
  swift: new Set(["class_declaration", "protocol_declaration", "function_declaration"]),
  kotlin: new Set(["class_declaration", "object_declaration", "function_declaration"]),
  lua: new Set(["function_declaration"]),
  scala: new Set(["class_definition", "object_definition", "trait_definition", "function_definition"]),
  sql: new Set([
    "create_table",
    "create_view",
    "create_materialized_view",
    "create_function",
    "create_index",
    "create_type",
    "create_schema",
    "create_trigger"
  ]),
  toml: new Set(["table", "table_array_element"])
}

/** Whether a node opens an outline heading. */
function isHeading(lang: Lang, node: Node): boolean {
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
function titleRow(node: Node): number {
  return (firstLineNode(node) ?? node).startPosition.row
}

// Every Gherkin heading rule emits its own `*_line` as the first element of its
// sequence, ahead of any nested heading or step, so first-match DFS returns the
// node's own title line and never crosses into a child heading.
function firstLineNode(node: Node): Node | null {
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
