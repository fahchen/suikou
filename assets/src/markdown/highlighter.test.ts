import { describe, expect, it } from "vitest"

import { shikiLangForPath } from "./highlighter"

describe("shikiLangForPath", () => {
  it("maps known extensions to Shiki languages", () => {
    expect(shikiLangForPath("spec/login.feature")).toBe("gherkin")
    expect(shikiLangForPath("lib/app.ex")).toBe("elixir")
    expect(shikiLangForPath("src/main.tsx")).toBe("tsx")
    expect(shikiLangForPath("util.ts")).toBe("typescript")
    expect(shikiLangForPath("README.md")).toBe("markdown")
  })

  it("is case-insensitive on the extension", () => {
    expect(shikiLangForPath("App.EX")).toBe("elixir")
  })

  it("returns null for unknown or extensionless files", () => {
    expect(shikiLangForPath("notes.txt")).toBeNull()
    expect(shikiLangForPath("Makefile")).toBeNull()
  })
})
