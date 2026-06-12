// @vitest-environment node
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import Parser from "web-tree-sitter"
import { beforeAll, describe, expect, it } from "vitest"

import { buildOutline, langForPath, type Lang } from "./outline"

const require = createRequire(import.meta.url)

const WASM: Partial<Record<Lang, string>> = {
  gherkin: fileURLToPath(new URL("./wasm/tree-sitter-gherkin.wasm", import.meta.url)),
  typescript: require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm")
}

async function parse(content: string, lang: Lang) {
  const wasm = WASM[lang]
  if (!wasm) throw new Error(`no grammar wasm registered for ${lang}`)

  const parser = new Parser()
  parser.setLanguage(await Parser.Language.load(wasm))
  return buildOutline(parser.parse(content).rootNode, content.split("\n"), lang)
}

describe("langForPath", () => {
  it("maps known source extensions to grammars", () => {
    expect(langForPath("lib/app.ex")).toBe("elixir")
    expect(langForPath("src/main.tsx")).toBe("tsx")
    expect(langForPath("util.ts")).toBe("typescript")
    expect(langForPath("spec/login.feature")).toBe("gherkin")
    expect(langForPath("config.yaml")).toBe("yaml")
  })

  it("returns null for markdown and unknown types", () => {
    expect(langForPath("README.md")).toBeNull()
    expect(langForPath("notes.txt")).toBeNull()
    expect(langForPath("Makefile")).toBeNull()
  })

  it("is case-insensitive on the extension", () => {
    expect(langForPath("App.EX")).toBe("elixir")
  })
})

describe("buildOutline", () => {
  beforeAll(async () => {
    await Parser.init()
  })

  const feature = [
    "@app @smoke",
    "Feature: Login",
    "  Background:",
    "    Given the app is running",
    "  @happy",
    "  Scenario: Valid credentials",
    "    Given a registered user",
    "  Scenario Outline: Bad input",
    "    When they submit <field>",
    "    Examples:",
    "      | field |",
    "      | empty |",
    "  Rule: Lockout",
    "    Scenario: Too many tries",
    "      Given five failed attempts"
  ].join("\n")

  it("nests Gherkin headings by tree depth and skips tags in titles", async () => {
    const items = await parse(feature, "gherkin")

    expect(items).toEqual([
      { level: 1, text: "Feature: Login", line: 2 },
      { level: 2, text: "Background", line: 3 },
      { level: 2, text: "Scenario: Valid credentials", line: 6 },
      { level: 2, text: "Scenario Outline: Bad input", line: 8 },
      { level: 3, text: "Examples", line: 10 },
      { level: 2, text: "Rule: Lockout", line: 13 },
      { level: 3, text: "Scenario: Too many tries", line: 14 }
    ])
  })

  it("derives depth from nesting for code grammars", async () => {
    const source = ["class Outer {", "  method() {", "  }", "}"].join("\n")
    const items = await parse(source, "typescript")

    expect(items).toEqual([
      { level: 1, text: "class Outer", line: 1 },
      { level: 2, text: "method()", line: 2 }
    ])
  })
})
