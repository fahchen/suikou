import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      })
    })
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
  }
})

const dispatch = vi.fn()
const listBranches = vi.fn()
const createDiffReview = vi.fn()
let snapshot: unknown
let rootEntries: { path: string; dir: boolean }[]
// `pick` was the old Base UI Select helper. Combobox is a plain Popover now,
// so `fireEvent.click` is enough.

vi.mock("../musubi", () => ({
  storeCache: {},
  usePrefetchReviewStore: () => () => undefined,
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
    if (name === "list_branches")
      return { dispatch: listBranches, isPending: false }
    if (name === "create_diff_review")
      return { dispatch: createDiffReview, isPending: false }
    return { dispatch, isPending: false }
  }
}))

import { ProjectBoard } from "./ProjectBoard"

beforeEach(() => {
  dispatch.mockReset()
  listBranches.mockReset()
  createDiffReview.mockReset()
  listBranches.mockResolvedValue({
    branches: ["main", "feature/x", "release"],
    remote_branches: ["origin/main", "origin/feature/x"],
    default: "main",
    error: null
  })
  createDiffReview.mockResolvedValue({ review_id: "r-diff", error: null })
  rootEntries = [
    { path: "design.md", dir: false },
    { path: "draft.md", dir: false }
  ]
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
            kind: "file_selection",
            selections: ["design.md"]
          }
        ]
      }
    ],
    review_files: {
      status: "ok",
      data: [{ review_id: "r1", files: [{ path: "design.md", artifact_id: "a-99", approved: false }] }],
      error: null
    }
  }
})

describe("ProjectBoard", () => {
  it("lists each project with its path and reviews", () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    expect(screen.getByText("Data Platform")).toBeInTheDocument()
    expect(screen.getByText("/tmp/dp")).toBeInTheDocument()
    expect(screen.getByText("Launch")).toBeInTheDocument()
  })

  it("badges file-selection and git-diff review cards distinctly", () => {
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
              kind: "file_selection",
              selections: ["design.md"]
            },
            {
              id: "r2",
              name: "Auth rewrite",
              inserted_at: "2026-06-12T10:00:00",
              kind: "git_diff",
              selections: [],
              base_ref: "main",
              head_ref: "origin/feature/x"
            }
          ]
        }
      ],
      review_files: {
        status: "ok",
        data: [
          { review_id: "r1", files: [{ path: "design.md", artifact_id: "a-99", approved: false }] },
          {
            review_id: "r2",
            files: [
              { path: "auth/login.ex", artifact_id: "a-1", approved: false },
              { path: "auth/session.ex", artifact_id: null, approved: false }
            ]
          }
        ],
        error: null
      }
    }
    render(<ProjectBoard onOpen={vi.fn()} />)

    const filesBadge = screen.getByText("Files")
    const diffBadge = screen.getByText("Diff")
    // Both badges read off the per-theme `--kind-{files,diff}-*` tokens so the
    // file-selection vs. diff distinction stays clear across light and dark
    // themes (the diff chip stays a fixed-hue blue independent of `--primary`).
    expect(filesBadge.className).toContain("bg-kind-files-bg")
    expect(diffBadge.className).toContain("bg-kind-diff-bg")
    expect(diffBadge.className).toContain("text-kind-diff-fg")
    expect(screen.getByText("main..origin/feature/x")).toBeInTheDocument()
    expect(screen.getByText("2 files")).toBeInTheDocument()
  })

  it("flags an all-HTML file-selection review with an HTML sub-badge", () => {
    snapshot = {
      projects: [
        {
          id: "p1",
          name: "Data Platform",
          path: "/tmp/dp",
          reviews: [
            {
              id: "r1",
              name: "Report",
              inserted_at: "2026-06-12T09:30:00",
              kind: "file_selection",
              selections: ["report.html"]
            },
            {
              id: "r2",
              name: "Design",
              inserted_at: "2026-06-12T10:00:00",
              kind: "file_selection",
              selections: ["design.md"]
            }
          ]
        }
      ],
      review_files: {
        status: "ok",
        data: [
          { review_id: "r1", files: [{ path: "report.html", artifact_id: "a-1", approved: false }] },
          { review_id: "r2", files: [{ path: "design.md", artifact_id: "a-2", approved: false }] }
        ],
        error: null
      }
    }
    render(<ProjectBoard onOpen={vi.fn()} />)

    // Only the all-HTML selection earns the badge; a generic file selection stays plain.
    const htmlBadge = screen.getByText("HTML")
    expect(htmlBadge.className).toContain("bg-kind-html-bg")
    expect(screen.getAllByText("Files")).toHaveLength(2)
  })

  it("shows em-dashes on the diff card subline when refs are missing", () => {
    snapshot = {
      projects: [
        {
          id: "p1",
          name: "Data Platform",
          path: "/tmp/dp",
          reviews: [
            {
              id: "r2",
              name: "Auth rewrite",
              inserted_at: "2026-06-12T10:00:00",
              kind: "git_diff",
              selections: [],
              base_ref: null,
              head_ref: null
            }
          ]
        }
      ],
      review_files: { status: "ok", data: [{ review_id: "r2", files: [] }], error: null }
    }
    render(<ProjectBoard onOpen={vi.fn()} />)
    expect(screen.getByText("–..–")).toBeInTheDocument()
  })

  it("renders a loading skeleton while review files are still resolving", () => {
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
              kind: "file_selection",
              selections: ["design.md"]
            }
          ]
        }
      ],
      review_files: { status: "loading", data: null, error: null }
    }
    render(<ProjectBoard onOpen={vi.fn()} />)

    const openButton = screen.getByRole("button", { name: "Open Launch" })
    expect(openButton).toBeDisabled()
    expect(openButton).toHaveAttribute("aria-busy", "true")
    expect(openButton).toHaveAttribute("title", "Loading review files…")
    expect(screen.getByLabelText("Loading files")).toBeInTheDocument()
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
    snapshot = { projects: [], review_files: { status: "ok", data: [], error: null } }
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

    fireEvent.click(await screen.findByLabelText("Head branch"))
    fireEvent.click(await screen.findByRole("option", { name: "feature/x" }))

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

  it("groups local and remote branches in the picker and filters by query", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    await waitFor(() => expect(listBranches).toHaveBeenCalled())

    fireEvent.click(await screen.findByLabelText("Head branch"))

    expect(await screen.findByText("Local")).toBeInTheDocument()
    expect(screen.getByText("Remote (origin)")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /main default/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "origin/main" })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Search branches"), {
      target: { value: "feature" }
    })

    expect(screen.queryByRole("option", { name: /main default/ })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "feature/x" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "origin/feature/x" })).toBeInTheDocument()
  })

  it("allows picking a remote branch as the head ref", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))

    fireEvent.change(screen.getByPlaceholderText("e.g. Auth rewrite"), {
      target: { value: "Auth rewrite" }
    })

    await waitFor(() => expect(listBranches).toHaveBeenCalled())

    fireEvent.click(await screen.findByLabelText("Head branch"))
    fireEvent.click(await screen.findByRole("option", { name: "origin/feature/x" }))

    fireEvent.click(screen.getByText("Create diff review"))

    await waitFor(() =>
      expect(createDiffReview).toHaveBeenCalledWith({
        project_id: "p1",
        name: "Auth rewrite",
        base_ref: "main",
        head_ref: "origin/feature/x"
      })
    )
  })

  it("shows an empty-state inside the picker when no branch matches the query", async () => {
    render(<ProjectBoard onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "New review" }))
    fireEvent.click(await screen.findByText("Review diff"))
    await waitFor(() => expect(listBranches).toHaveBeenCalled())

    fireEvent.click(await screen.findByLabelText("Head branch"))
    fireEvent.change(await screen.findByLabelText("Search branches"), {
      target: { value: "nonexistent" }
    })
    expect(screen.getByText("No branches match.")).toBeInTheDocument()
  })

  it("surfaces a list_branches error inside the diff-review composer", async () => {
    listBranches.mockResolvedValueOnce({
      branches: [],
      remote_branches: [],
      default: null,
      error: "not_a_git_repo"
    })
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

    fireEvent.click(await screen.findByLabelText("Head branch"))
    fireEvent.click(await screen.findByRole("option", { name: "release" }))

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
