// Codegen: per-theme CSS-variable palettes for Shiki's css-variables theme.
//
// Tokenization is theme-independent (done once with the css-variables theme),
// so theme switching is pure CSS. This script extracts each real Shiki theme's
// colours into a `[data-theme="<name>"]` block of `--shiki-*` variables that the
// css-variables theme reads at render time. Run via `bun run build:theme-css`.
//
// EXTRACTION: tokenize a multi-category snippet per theme with
// `includeExplanation`, then for each token match its TextMate scope chain
// against SCOPE_RULES — the exact scope -> variable mapping `createCssVariablesTheme`
// itself uses (mirrored from @shikijs/core) — recording category -> token.color.
// `--shiki-foreground`/`--shiki-background` come from the theme's fg/bg; any
// category with no hit falls back to the theme foreground.

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createHighlighter, type BundledLanguage, type BundledTheme } from "shiki"

import { THEME_CODE, THEMES, type ThemeName } from "../src/themes"

/** css-variables categories that take a colour, in emission order. */
const CATEGORIES = [
  "foreground",
  "background",
  "token-keyword",
  "token-string",
  "token-comment",
  "token-function",
  "token-constant",
  "token-parameter",
  "token-punctuation",
  "token-link",
  "token-string-expression",
  "token-inserted",
  "token-deleted",
  "token-changed"
] as const

type Category = (typeof CATEGORIES)[number]

/**
 * Scope -> css-variables category, mirroring the `tokenColors` of
 * `createCssVariablesTheme` in @shikijs/core so extraction matches what the
 * theme would resolve. Order matters: later rules override earlier ones for the
 * same scope, exactly as TextMate applies the theme's settings array.
 */
const SCOPE_RULES: ReadonlyArray<{ category: Category; scopes: readonly string[] }> = [
  {
    category: "token-string",
    scopes: ["string", "markup.fenced_code", "markup.inline", "beginning.punctuation.definition.list.markdown"]
  },
  { category: "token-comment", scopes: ["comment", "string.quoted.docstring.multi"] },
  {
    category: "token-constant",
    scopes: [
      "constant.numeric",
      "constant.language",
      "constant.other.placeholder",
      "constant.character.format.placeholder",
      "variable.language.this",
      "variable.other.object",
      "variable.other.class",
      "variable.other.constant",
      "meta.property-name",
      "meta.property-value",
      "support"
    ]
  },
  {
    category: "token-keyword",
    scopes: [
      "keyword",
      "storage.modifier",
      "storage.type",
      "storage.control.clojure",
      "entity.name.function.clojure",
      "entity.name.tag.yaml",
      "support.function.node",
      "support.type.property-name.json",
      "punctuation.separator.key-value",
      "punctuation.definition.template-expression",
      "punctuation.definition.string.begin.markdown",
      "punctuation.definition.string.end.markdown",
      "string.other.link.title.markdown",
      "string.other.link.description.markdown"
    ]
  },
  { category: "token-parameter", scopes: ["variable.parameter.function"] },
  {
    category: "token-function",
    scopes: [
      "support.function",
      "entity.name.type",
      "entity.other.inherited-class",
      "meta.function-call",
      "meta.instance.constructor",
      "entity.other.attribute-name",
      "entity.name.function",
      "constant.keyword.clojure"
    ]
  },
  {
    category: "token-string-expression",
    scopes: [
      "entity.name.tag",
      "string.quoted",
      "string.regexp",
      "string.interpolated",
      "string.template",
      "string.unquoted.plain.out.yaml",
      "keyword.other.template"
    ]
  },
  {
    category: "token-punctuation",
    scopes: [
      "punctuation.definition.arguments",
      "punctuation.definition.dict",
      "punctuation.separator",
      "meta.function-call.arguments"
    ]
  },
  {
    category: "token-link",
    scopes: [
      "meta.link.inline.markdown",
      "markup.underline.link",
      "punctuation.definition.metadata.markdown"
    ]
  },
  {
    category: "token-inserted",
    scopes: ["markup.inserted", "meta.diff.header.to-file", "punctuation.definition.inserted"]
  },
  {
    category: "token-deleted",
    scopes: ["markup.deleted", "meta.diff.header.from-file", "punctuation.definition.deleted"]
  },
  { category: "token-changed", scopes: ["markup.changed", "punctuation.definition.changed"] }
]

/**
 * Per-language snippets exercising every colour category. Each token's scope
 * chain is matched against SCOPE_RULES, so spreading categories across a few
 * grammars (incl. markdown for links and diff for change markers) gives every
 * variable at least one hit in a typical theme.
 */
const SNIPPETS: ReadonlyArray<{ lang: BundledLanguage; code: string }> = [
  {
    lang: "typescript",
    code: [
      "// a comment",
      "import { foo } from 'mod'",
      "const answer = 42",
      "function greet(name: string): string {",
      '  return `hello ${name}, foo=${foo}`',
      "}",
      "class Box {}",
      "greet('world')"
    ].join("\n")
  },
  {
    lang: "markdown",
    code: ["# Heading", "", "A [link](https://example.com) and `code`.", ""].join("\n")
  },
  {
    lang: "diff",
    code: ["--- a/file", "+++ b/file", "-removed line", "+added line"].join("\n")
  }
]

/** Most-specific matching category for a token's scope chain, or null. */
function categoryForScopes(scopes: readonly string[]): Category | null {
  let match: Category | null = null
  // Inner scopes (end of the chain) are more specific; later rules win ties.
  for (const scopeName of scopes) {
    for (const rule of SCOPE_RULES) {
      if (rule.scopes.some((s) => scopeName === s || scopeName.startsWith(`${s}.`))) {
        match = rule.category
      }
    }
  }
  return match
}

async function paletteFor(theme: BundledTheme): Promise<Record<Category, string>> {
  const hl = await createHighlighter({ themes: [theme], langs: SNIPPETS.map((s) => s.lang) })
  try {
    const meta = hl.getTheme(theme)
    const foreground = meta.fg
    const palette = { foreground, background: meta.bg } as Record<Category, string>

    for (const { lang, code } of SNIPPETS) {
      const { tokens } = hl.codeToTokens(code, { lang, theme, includeExplanation: true })
      for (const token of tokens.flat()) {
        const color = token.color
        if (!color) continue
        for (const part of token.explanation ?? []) {
          const category = categoryForScopes(part.scopes.map((s) => s.scopeName))
          if (category && palette[category] === undefined) palette[category] = color
        }
      }
    }

    for (const category of CATEGORIES) {
      if (palette[category] === undefined) palette[category] = foreground
    }
    return palette
  } finally {
    hl.dispose()
  }
}

function cssBlock(name: ThemeName, palette: Record<Category, string>): string {
  const lines = CATEGORIES.map((c) => `  --shiki-${c}: ${palette[c]};`)
  return `[data-theme="${name}"] {\n${lines.join("\n")}\n}`
}

async function main(): Promise<void> {
  const blocks: string[] = []
  for (const name of THEMES) {
    const palette = await paletteFor(THEME_CODE[name].shiki as BundledTheme)
    blocks.push(cssBlock(name, palette))
  }

  const header =
    "/* GENERATED by scripts/gen-theme-css.ts — do not edit by hand.\n" +
    "   Run `bun run build:theme-css` to regenerate.\n" +
    "   Per-theme Shiki css-variables palettes; tokenization is theme-independent\n" +
    "   so switching [data-theme] re-selects a palette in pure CSS, no re-tokenize. */\n"
  const out = `${header}\n${blocks.join("\n\n")}\n`

  const target = fileURLToPath(new URL("../src/shiki-themes.css", import.meta.url))
  writeFileSync(target, out)
  console.log(`Wrote ${THEMES.length} theme palettes to ${target}`)
}

await main()
