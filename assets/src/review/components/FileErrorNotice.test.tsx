import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { FileErrorNotice } from "./EditorSurface"

describe("FileErrorNotice", () => {
  test("a diff review's 404 reads as 'no changes under the current source lens'", () => {
    render(
      <FileErrorNotice
        isDiff
        content={{ kind: "error", message: "Couldn't load file (404).", status: 404 }}
        meta="lib/foo.ex"
      />,
    )

    expect(screen.getByText("Diff unavailable")).toBeTruthy()
    expect(screen.getByText(/no changes under the current source lens/)).toBeTruthy()
  })

  test("a diff review's 500 is a genuine load error, not a lens hint", () => {
    render(
      <FileErrorNotice
        isDiff
        content={{ kind: "error", message: "Couldn't load file (500).", status: 500 }}
        meta="lib/foo.ex"
      />,
    )

    expect(screen.getByText("Can't load this file")).toBeTruthy()
    expect(screen.getByText("Couldn't load file (500).")).toBeTruthy()
    expect(screen.queryByText(/no changes under the current source lens/)).toBeNull()
  })

  test("a non-diff review's 404 is a plain load error", () => {
    render(
      <FileErrorNotice
        isDiff={false}
        content={{ kind: "error", message: "Couldn't load file (404).", status: 404 }}
        meta="docs/plan.md"
      />,
    )

    expect(screen.getByText("Can't load this file")).toBeTruthy()
    expect(screen.queryByText(/no changes under the current source lens/)).toBeNull()
  })
})
