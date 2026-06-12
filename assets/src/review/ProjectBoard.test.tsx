import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"

const dispatch = vi.fn()
let snapshot: unknown
let projectFiles: string[]

vi.mock("../musubi", () => ({
  useMusubiRoot: () => ({ status: "ok", store: {} }),
  useMusubiSnapshot: () => snapshot,
  useMusubiCommand: (_store: unknown, name: string) =>
    name === "list_project_files"
      ? { dispatch: () => Promise.resolve({ files: projectFiles }), isPending: false }
      : { dispatch, isPending: false }
}))

import { ProjectBoard } from "./ProjectBoard"

beforeEach(() => {
  dispatch.mockReset()
  projectFiles = ["design.md", "draft.md"]
  snapshot = {
    projects: [
      {
        id: "p1",
        name: "Data Platform",
        path: "/tmp/dp",
        reviews: [
          {
            id: "r1",
            name: "Launch",
            files: [{ artifact_id: "a-99", path: "design.md", approved: false }]
          }
        ]
      }
    ]
  }
})

describe("ProjectBoard", () => {
  it("lists each project with its path and reviews", () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    expect(screen.getByText("Data Platform")).toBeInTheDocument()
    expect(screen.getByText("/tmp/dp")).toBeInTheDocument()
    expect(screen.getByText("Launch")).toBeInTheDocument()
  })

  it("reveals a review's files only once expanded", () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    expect(screen.queryByText("design.md")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("Launch"))

    expect(screen.getByText("design.md")).toBeInTheDocument()
  })

  it("opens a review file by its artifact id", () => {
    const onOpen = vi.fn()
    render(<ProjectBoard onOpen={onOpen} />)

    fireEvent.click(screen.getByText("Launch"))
    fireEvent.click(screen.getByText("design.md"))

    expect(onOpen).toHaveBeenCalledWith("a-99")
  })

  it("deletes a review from the actions menu", async () => {
    dispatch.mockResolvedValue({ error: null })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("Review actions"))
    fireEvent.click(await screen.findByText("Delete review"))
    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ review_id: "r1" }))
  })

  it("creates a review from a name and selected files", async () => {
    dispatch.mockResolvedValue({ review_id: "r-new", error: null })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByText("New review"))
    fireEvent.change(screen.getByPlaceholderText("e.g. Launch docs"), {
      target: { value: "Spec pass" }
    })

    const composer = screen.getByText("New review", { selector: "h3" }).closest("div")!.parentElement!
    const [firstFile] = await within(composer).findAllByRole("checkbox")
    fireEvent.click(firstFile)

    fireEvent.click(screen.getByText("Create review"))

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        project_id: "p1",
        name: "Spec pass",
        file_paths: ["design.md"]
      })
    )
  })

  it("edits a review's file selection", async () => {
    dispatch.mockResolvedValue({ error: null })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("Review actions"))
    fireEvent.click(await screen.findByText("Edit files"))

    const checkboxes = await screen.findAllByRole("checkbox")
    fireEvent.click(checkboxes[1])

    fireEvent.click(screen.getByText("Save files"))

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        review_id: "r1",
        file_paths: ["design.md", "draft.md"]
      })
    )
  })

  it("shows an empty state when no project is registered", () => {
    snapshot = { projects: [] }
    render(<ProjectBoard onOpen={vi.fn()} />)

    expect(screen.getByText(/No projects yet/)).toBeInTheDocument()
  })

  it("creates a project from the working directory and name", async () => {
    dispatch.mockResolvedValue({ project_id: "p-new", error: null })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Docs" }
    })
    fireEvent.change(screen.getByLabelText("Working directory"), {
      target: { value: "/tmp/docs" }
    })
    fireEvent.click(screen.getByText("Create project"))

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ name: "Docs", path: "/tmp/docs" })
    )
  })

  it("surfaces a create-project error", async () => {
    dispatch.mockResolvedValue({ project_id: null, error: "not_a_directory" })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Docs" }
    })
    fireEvent.change(screen.getByLabelText("Working directory"), {
      target: { value: "/no/such/dir" }
    })
    fireEvent.click(screen.getByText("Create project"))

    await waitFor(() => expect(screen.getByText("not_a_directory")).toBeInTheDocument())
  })
})
