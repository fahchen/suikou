import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"

const dispatch = vi.fn()
const listBranches = vi.fn()
const createDiffReview = vi.fn()
let snapshot: unknown
let rootEntries: { path: string; dir: boolean }[]
let reviewFiles: { path: string; artifact_id: string | null; approved: boolean }[]

vi.mock("../musubi", () => ({
  storeCache: {},
  useMusubiRoot: () => ({
    status: "ready",
    store: {},
    error: null,
    isFetching: false,
    revalidationError: null
  }),
  useMusubiSnapshot: () => snapshot,
  useMusubiCommand: (_store: unknown, name: string) => {
    if (name === "list_dir")
      return { dispatch: () => Promise.resolve({ entries: rootEntries }), isPending: false }
    if (name === "list_review_files")
      return { dispatch: () => Promise.resolve({ files: reviewFiles, error: null }), isPending: false }
    if (name === "list_branches")
      return { dispatch: listBranches, isPending: false }
    if (name === "create_diff_review")
      return { dispatch: createDiffReview, isPending: false }
    return { dispatch, isPending: false }
  }
}))

import { ProjectBoard } from "./ProjectBoard"

function pick(el: HTMLElement) {
  fireEvent.pointerDown(el)
  fireEvent.pointerUp(el)
  fireEvent.click(el)
}

beforeEach(() => {
  dispatch.mockReset()
  listBranches.mockReset()
  createDiffReview.mockReset()
  listBranches.mockResolvedValue({
    branches: ["main", "feature/x", "release"],
    default: "main",
    error: null
  })
  createDiffReview.mockResolvedValue({ review_id: "r-diff", error: null })
  rootEntries = [
    { path: "design.md", dir: false },
    { path: "draft.md", dir: false }
  ]
  reviewFiles = [{ path: "design.md", artifact_id: "a-99", approved: false }]
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
            inserted_at: "2026-06-12T09:30:00",
            selections: ["design.md"],
            selection_count: 1
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

  it("reveals a review's files only once expanded", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    expect(screen.queryByText("design.md")).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("Expand files"))

    expect(await screen.findByText("design.md")).toBeInTheDocument()
  })

  it("opens a review file by resolving its path to an artifact id", async () => {
    dispatch.mockResolvedValue({ artifact_id: "a-99", error: null })
    const onOpen = vi.fn()
    render(<ProjectBoard onOpen={onOpen} />)

    fireEvent.click(screen.getByLabelText("Expand files"))
    fireEvent.click(await screen.findByText("design.md"))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("a-99"))
  })

  it("opens a review by its title without expanding", async () => {
    dispatch.mockResolvedValue({ artifact_id: "a-99", error: null })
    const onOpen = vi.fn()
    render(<ProjectBoard onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "Open Launch" }))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("a-99"))
    expect(screen.queryByText("design.md")).not.toBeInTheDocument()
  })

  it("renames a review from the actions menu", async () => {
    dispatch.mockResolvedValue({ error: null })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("Review actions"))
    fireEvent.click(await screen.findByText("Rename"))

    const input = screen.getByLabelText("Review name")
    fireEvent.change(input, { target: { value: "Spec pass" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ review_id: "r1", name: "Spec pass" })
    )
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

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review files"))
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
        selections: ["design.md"]
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
        selections: ["design.md", "draft.md"]
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

    fireEvent.click(screen.getByRole("button", { name: "New project" }))
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

  it("loads branches and preselects the default base when opening diff-review composer", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    await waitFor(() => expect(listBranches).toHaveBeenCalledWith({ project_id: "p1" }))
    const baseTrigger = await screen.findByLabelText("Base branch")
    await waitFor(() => expect(baseTrigger.textContent).toContain("main"))
  })

  it("creates a diff review with the chosen base and head refs", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    fireEvent.change(screen.getByPlaceholderText("e.g. Auth rewrite"), {
      target: { value: "Auth rewrite" }
    })

    await waitFor(() => expect(listBranches).toHaveBeenCalled())

    pick(await screen.findByLabelText("Head branch"))
    pick(await screen.findByRole("option", { name: "feature/x" }))

    fireEvent.click(screen.getByText("Create diff review"))

    await waitFor(() =>
      expect(createDiffReview).toHaveBeenCalledWith({
        project_id: "p1",
        name: "Auth rewrite",
        base_ref: "main",
        head_ref: "feature/x"
      })
    )
  })

  it("surfaces a list_branches error inside the diff-review composer", async () => {
    listBranches.mockResolvedValueOnce({ branches: [], default: null, error: "not_a_git_repo" })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    await waitFor(() => expect(screen.getByText("not_a_git_repo")).toBeInTheDocument())
  })

  it("surfaces a create_diff_review error", async () => {
    createDiffReview.mockResolvedValueOnce({ review_id: null, error: "head_missing" })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    fireEvent.change(screen.getByPlaceholderText("e.g. Auth rewrite"), {
      target: { value: "Auth rewrite" }
    })

    await waitFor(() => expect(listBranches).toHaveBeenCalled())

    pick(await screen.findByLabelText("Head branch"))
    pick(await screen.findByRole("option", { name: "release" }))

    fireEvent.click(screen.getByText("Create diff review"))

    await waitFor(() => expect(screen.getByText("head_missing")).toBeInTheDocument())
  })

  it("surfaces a create-project error", async () => {
    dispatch.mockResolvedValue({ project_id: null, error: "not_a_directory" })
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New project" }))
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
