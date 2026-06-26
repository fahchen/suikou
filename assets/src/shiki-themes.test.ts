import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, it, expect } from "vitest"

import { THEMES } from "./themes"

// Read the generated file from disk (cwd is `assets/` under vitest): a `?raw`
// import is stubbed to empty by Vite's CSS handling in the test environment.
const css = readFileSync(resolve(process.cwd(), "src/shiki-themes.css"), "utf8")

describe("generated shiki theme palettes", () => {
  it("emits a palette block with a keyword colour for every ThemeName", () => {
    for (const name of THEMES) {
      const block = css.match(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))
      expect(block, `missing palette block for ${name}`).not.toBeNull()
      expect(block?.[1], `${name} missing --shiki-token-keyword`).toContain("--shiki-token-keyword:")
    }
  })

  it("gives visually-distinct themes different keyword colours", () => {
    const keyword = (name: string) =>
      css
        .match(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))?.[1]
        .match(/--shiki-token-keyword:\s*([^;]+);/)?.[1]
        .trim()

    expect(keyword("dracula")).toBeDefined()
    expect(keyword("github")).toBeDefined()
    expect(keyword("dracula")).not.toBe(keyword("github"))
  })
})
