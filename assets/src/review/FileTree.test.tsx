import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import { buildTree, FileTree } from "./FileTree"

describe("buildTree", () => {
  it("nests paths into folders with files sorted after folders", () => {
    const tree = buildTree(["readme.md", "docs/spec.md", "docs/plan.md"])

    expect(tree.map((node) => node.name)).toEqual(["docs", "readme.md"])
    const docs = tree[0]
    expect(docs.isFile).toBe(false)
    expect(docs.children.map((node) => node.name)).toEqual(["plan.md", "spec.md"])
  })
})

describe("FileTree", () => {
  it("cascades a folder toggle to every file beneath it", () => {
    const onChange = vi.fn()
    render(
      <FileTree
        files={["docs/plan.md", "docs/spec.md"]}
        selected={new Set()}
        onChange={onChange}
      />
    )

    const folder = screen.getAllByRole("checkbox")[0]
    fireEvent.click(folder)

    expect(onChange).toHaveBeenCalledWith(new Set(["docs/plan.md", "docs/spec.md"]))
  })

  it("marks a partially selected folder as indeterminate", () => {
    render(
      <FileTree
        files={["docs/plan.md", "docs/spec.md"]}
        selected={new Set(["docs/plan.md"])}
        onChange={vi.fn()}
      />
    )

    const folder = screen.getAllByRole("checkbox")[0]
    expect(folder).toHaveAttribute("aria-checked", "mixed")
  })

  it("removes a single file from the selection on toggle", () => {
    const onChange = vi.fn()
    render(
      <FileTree
        files={["docs/plan.md", "docs/spec.md"]}
        selected={new Set(["docs/plan.md", "docs/spec.md"])}
        onChange={onChange}
      />
    )

    const docs = screen.getByText("docs").closest("li")!
    const fileBox = within(docs).getAllByRole("checkbox")[1]
    fireEvent.click(fileBox)

    expect(onChange).toHaveBeenCalledWith(new Set(["docs/spec.md"]))
  })
})
