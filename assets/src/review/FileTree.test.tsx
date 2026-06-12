import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"

import { FileTree, type DirEntry } from "./FileTree"

// A canned tree: root has folder "docs" and file "readme.md"; docs holds two files.
const TREE: Record<string, DirEntry[]> = {
  "": [
    { path: "docs", dir: true },
    { path: "readme.md", dir: false }
  ],
  docs: [
    { path: "docs/plan.md", dir: false },
    { path: "docs/spec.md", dir: false }
  ]
}

const loadDir = (path: string) => Promise.resolve(TREE[path] ?? [])

describe("FileTree", () => {
  it("reads only the root level until a folder is opened", async () => {
    const spy = vi.fn(loadDir)
    render(<FileTree loadDir={spy} selected={new Set()} onChange={vi.fn()} />)

    await screen.findByText("docs")
    expect(screen.queryByText("plan.md")).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("")

    fireEvent.click(screen.getByText("docs"))

    expect(await screen.findByText("plan.md")).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith("docs")
  })

  it("selects a directory as a single wildcard path", async () => {
    const onChange = vi.fn()
    render(<FileTree loadDir={loadDir} selected={new Set()} onChange={onChange} />)

    const docs = (await screen.findByText("docs")).closest("li")!
    fireEvent.click(within(docs).getByRole("checkbox"))

    expect(onChange).toHaveBeenCalledWith(new Set(["docs"]))
  })

  it("shows a directory checked and its children locked when selected", async () => {
    render(<FileTree loadDir={loadDir} selected={new Set(["docs"])} onChange={vi.fn()} />)

    const docs = (await screen.findByText("docs")).closest("li")!
    expect(within(docs).getByRole("checkbox")).toHaveAttribute("aria-checked", "true")

    fireEvent.click(screen.getByText("docs"))
    const child = await screen.findByText("plan.md")
    const box = within(child.closest("li")!).getByRole("checkbox")
    expect(box).toHaveAttribute("aria-checked", "true")
    expect(box).toBeDisabled()
  })

  it("marks a directory indeterminate when only some descendants are picked", async () => {
    render(
      <FileTree loadDir={loadDir} selected={new Set(["docs/plan.md"])} onChange={vi.fn()} />
    )

    const docs = (await screen.findByText("docs")).closest("li")!
    await waitFor(() =>
      expect(within(docs).getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed")
    )
  })
})
