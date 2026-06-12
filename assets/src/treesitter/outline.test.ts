import { describe, expect, it } from "vitest"

import { langForPath } from "./outline"

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
