import { Language, Parser, type Node } from "web-tree-sitter"

import coreWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url"

export interface OutlineItem {
  level: number
  text: string
  line: number
}

/** Languages we can outline; each maps to a grammar wasm loaded on demand. */
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
  | "ruby"
  | "toml"
  | "gherkin"

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
  ruby: () => import("./wasm/tree-sitter-ruby.wasm?url"),
  toml: () => import("./wasm/tree-sitter-toml.wasm?url"),
  gherkin: () => import("./wasm/tree-sitter-gherkin.wasm?url"),
}

const EXTENSIONS: Record<string, Lang> = {
  ex: "elixir", exs: "elixir", heex: "elixir", eex: "elixir",
  ts: "typescript", mts: "typescript", cts: "typescript",
  tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  json: "json",
  py: "python", rs: "rust", go: "go",
  sh: "bash", bash: "bash",
  yml: "yaml", yaml: "yaml",
  css: "css", html: "html", htm: "html",
  rb: "ruby", toml: "toml", feature: "gherkin",
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
  parserReady ??= Parser.init({ locateFile: () => coreWasmUrl }).then(() => new Parser())
  return parserReady
}

function getLanguage(lang: Lang): Promise<Language> {
  let pending = languages.get(lang)
  if (!pending) {
    // Load from bytes, not a URL string: web-tree-sitter's string path probes
    // `globalThis.process.versions.node`, which throws under Vite's partial
    // `process` shim. Fetching the wasm ourselves sidesteps that.
    pending = GRAMMAR_URL[lang]()
      .then(({ default: url }) => fetch(url))
      .then((response) => response.arrayBuffer())
      .then((buffer) => Language.load(new Uint8Array(buffer)))
    languages.set(lang, pending)
  }
  return pending
}

/**
 * Parses source with the language's grammar and walks the tree into outline
 * items (modules, definitions, scenarios…), each carrying its 1-based source
 * line so the table of contents can anchor to the editor gutter.
 */
export async function outline(content: string, lang: Lang): Promise<OutlineItem[]> {
  const parser = await getParser()
  parser.setLanguage(await getLanguage(lang))
  const tree = parser.parse(content)
  if (!tree) return []
  return buildOutline(tree.rootNode, content.split("\n"), lang)
}

// Nesting depth comes from how many heading ancestors a node has, so a heading
// nests by its position in the tree rather than a fixed per-type level.
function buildOutline(root: Node, lines: string[], lang: Lang): OutlineItem[] {
  const items: OutlineItem[] = []
  const visit = (node: Node, depth: number): void => {
    const heading = isHeading(lang, node)
    const nextDepth = heading ? depth + 1 : depth
    if (heading) {
      const row = lang === "gherkin" ? titleRow(node) : node.startPosition.row
      items.push({ level: nextDepth, text: label(lines, row), line: row + 1 })
    }
    for (const child of node.namedChildren) if (child) visit(child, nextDepth)
  }
  visit(root, 0)
  return items
}

const ELIXIR_DEFS = new Set([
  "defmodule", "defprotocol", "defimpl", "def", "defp", "defmacro", "defmacrop",
  "defstruct", "describe", "test",
])

const HEADING_TYPES: Partial<Record<Lang, Set<string>>> = {
  typescript: new Set([
    "class_declaration", "abstract_class_declaration", "interface_declaration",
    "type_alias_declaration", "enum_declaration", "function_declaration", "method_definition",
  ]),
  python: new Set(["class_definition", "function_definition"]),
  rust: new Set(["mod_item", "struct_item", "enum_item", "trait_item", "impl_item", "function_item"]),
  go: new Set(["function_declaration", "method_declaration", "type_declaration"]),
  bash: new Set(["function_definition"]),
  ruby: new Set(["module", "class", "method", "singleton_method"]),
  gherkin: new Set(["feature", "rule", "background", "scenario", "examples"]),
}

function isHeading(lang: Lang, node: Node): boolean {
  if (lang === "elixir") {
    if (node.type !== "call") return false
    const head = node.firstNamedChild
    return head?.type === "identifier" && ELIXIR_DEFS.has(head.text)
  }
  if (lang === "tsx" || lang === "javascript") return HEADING_TYPES.typescript?.has(node.type) ?? false
  return HEADING_TYPES[lang]?.has(node.type) ?? false
}

// Gherkin wraps a heading's tags ahead of its keyword line, so the node's own
// start row can land on a `@tag` line; the title lives on the nearest `*_line`.
function titleRow(node: Node): number {
  return (firstLineNode(node) ?? node).startPosition.row
}

function firstLineNode(node: Node): Node | null {
  for (const child of node.namedChildren) {
    if (!child) continue
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
