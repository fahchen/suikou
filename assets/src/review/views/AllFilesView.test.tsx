import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { AllFilesView } from "./AllFilesView"
import { MISSING_CONTENT_MESSAGE } from "../use-content"
import { uiStore } from "../../stores/ui-store"
import type { FileSnapshot, FileStore, ReviewSnapshot, ReviewStore } from "../types"

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
        dispatchEvent: () => false,
      }),
    })
  }
})

vi.mock("../../markdown/use-markdown", () => ({
  useMarkdown: () => ({ blocks: [], loading: false }),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined,
}))

// Prevent tree-sitter WASM from loading in jsdom: TOC parsing is not under test.
vi.mock("../TopBarTocMenu", () => ({
  TopBarTocMenu: () => null,
}))

const setDraftVerdictDispatch = vi.fn(async () => ({}))
const stub = { dispatch: vi.fn(), isPending: false }

vi.mock("../commands", () => ({
  useReviewCommands: () => ({
    addComment: stub,
    editComment: stub,
    deleteComment: stub,
    resolveComment: stub,
    reply: stub,
    editReply: stub,
    deleteReply: stub,
    submitReview: stub,
    setDraftVerdict: { dispatch: setDraftVerdictDispatch, isPending: false },
    selectRound: stub,
  }),
  ReviewCommandsOverrideContext: {
    Provider: (props: { children: React.ReactNode }) => props.children,
  },
}))

// useMusubiSnapshot reads __fake_snapshot off the fake proxy so each card
// gets the FileSnapshot we set up without a real Musubi connection.
vi.mock("../../musubi", async () => {
  const actual = await vi.importActual<typeof import("../../musubi")>("../../musubi")
  return {
    ...actual,
    useMusubiSnapshot: vi.fn((store: unknown) => {
      return (store as { __fake_snapshot: unknown }).__fake_snapshot
    }),
  }
})

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  setDraftVerdictDispatch.mockReset()
  // Default: succeed with empty content so cards that mount their bodies don't throw.
  // Individual tests override with mockResolvedValueOnce.
  fetchMock.mockResolvedValue(new Response("", { status: 200 }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  uiStore.setHideReviewed(false)
})

function makeFileSnapshot(overrides: Partial<{
  path: string
  artifact_id: string | null
  content_hash: string | null
  change_status: string | null
  draft_verdict: string | null
  latest_verdict: string | null
  current_round_hash: string
}>  = {}): FileSnapshot {
  const path = overrides.path ?? "test.md"
  const artifactId = overrides.artifact_id ?? null
  return {
    path,
    artifact_id: artifactId,
    content_hash: overrides.content_hash ?? null,
    change_status: overrides.change_status ?? null,
    artifact: { id: artifactId ?? "", title: path, approved: false, approved_round: null },
    rounds: [],
    current_round: {
      number: artifactId ? 1 : 0,
      content_hash: overrides.current_round_hash ?? (artifactId ? "h1" : ""),
      is_latest: true,
    },
    comments: { items: [] },
    latest_verdict: overrides.latest_verdict ?? null,
    draft_verdict: overrides.draft_verdict ?? null,
  } as unknown as FileSnapshot
}

function fakeFileStore(snapshot: FileSnapshot): FileStore {
  return { __fake_snapshot: snapshot, dispatchCommand: vi.fn() } as unknown as FileStore
}

function setup(fileOverrides: Parameters<typeof makeFileSnapshot>[] = [[]]) {
  const snaps = fileOverrides.map((args) => makeFileSnapshot(args[0]))
  const stores = snaps.map(fakeFileStore)
  const reviewSnapshot: ReviewSnapshot = {
    review_id: "rv-1",
    name: "test review",
    kind: "file",
    artifacts: [],
    file_entries: {
      __musubi_async__: true,
      status: "ok",
      result: [],
      data: [],
      reason: null,
    },
    files: snaps,
  } as unknown as ReviewSnapshot
  const reviewStore: ReviewStore = {
    files: stores,
    dispatchCommand: vi.fn(),
  } as unknown as ReviewStore
  return { reviewSnapshot, reviewStore, snaps, stores }
}

function renderAllFiles(fileOverrides: Parameters<typeof makeFileSnapshot>[] = [[]]) {
  const { reviewSnapshot, reviewStore } = setup(fileOverrides)
  return render(
    <AllFilesView reviewId="rv-1" reviewSnapshot={reviewSnapshot} reviewStore={reviewStore} />,
  )
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200 })
}

function notFoundResponse(): Response {
  return new Response("", { status: 404 })
}

describe("AllFilesView empty state", () => {
  it("shows loading notice when no files and file_entries is loading", () => {
    const { reviewSnapshot, reviewStore } = setup([])
    // Override to loading state
    const loadingSnapshot = {
      ...reviewSnapshot,
      file_entries: { __musubi_async__: true, status: "loading", result: null, data: null, reason: null },
    } as unknown as ReviewSnapshot
    render(<AllFilesView reviewId="rv-1" reviewSnapshot={loadingSnapshot} reviewStore={reviewStore} />)
    expect(screen.getByText("Loading files…")).toBeInTheDocument()
  })

  it("shows no-files notice when file_entries loaded but empty", () => {
    const { reviewSnapshot, reviewStore } = setup([])
    render(<AllFilesView reviewId="rv-1" reviewSnapshot={reviewSnapshot} reviewStore={reviewStore} />)
    expect(screen.getByText("No files")).toBeInTheDocument()
  })
})

describe("AllFilesView card rendering", () => {
  it("renders one card per file", async () => {
    fetchMock.mockResolvedValue(okResponse("# content"))
    renderAllFiles([[{ path: "a.md", artifact_id: "art-a", current_round_hash: "ha" }], [{ path: "b.md", artifact_id: "art-b", current_round_hash: "hb" }]])
    // Each card header shows the file path
    expect(await screen.findByText("a.md")).toBeInTheDocument()
    expect(await screen.findByText("b.md")).toBeInTheDocument()
  })

  it("shows a verdict chip per card", async () => {
    fetchMock.mockResolvedValue(okResponse("# hello"))
    renderAllFiles([[{ path: "file.md", artifact_id: null, content_hash: "hx" }]])
    const chip = await screen.findByRole("button", { name: /File verdict:/i })
    expect(chip).toBeInTheDocument()
  })

  it("sorts cards alphabetically by path", async () => {
    fetchMock.mockResolvedValue(okResponse("x"))
    renderAllFiles([
      [{ path: "z.md", artifact_id: "art-z", current_round_hash: "hz" }],
      [{ path: "a.md", artifact_id: "art-a", current_round_hash: "ha" }],
    ])
    const paths = await screen.findAllByText(/\.(md)/)
    // a.md should appear before z.md in the DOM
    const texts = paths.map((el) => el.textContent)
    const aIdx = texts.findIndex((t) => t === "a.md")
    const zIdx = texts.findIndex((t) => t === "z.md")
    expect(aIdx).toBeLessThan(zIdx)
  })
})

describe("AllFilesView content fetch routing", () => {
  it("fetches minted files via artifact content route", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("content"))
    renderAllFiles([[{ path: "src/foo.ts", artifact_id: "art-99", current_round_hash: "hx" }]])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/review/art-99/content")
  })

  it("fetches unminted files via review + path route", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("# Hello"))
    renderAllFiles([[{ path: "docs/plan.md", artifact_id: null, content_hash: "ch1" }]])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/review/rv-1/files/content?path=docs%2Fplan.md")
  })

  it("renders missing-source notice on 404", async () => {
    fetchMock.mockResolvedValueOnce(notFoundResponse())
    renderAllFiles([[{ path: "deleted.md", artifact_id: null, content_hash: null }]])
    expect(await screen.findByText(MISSING_CONTENT_MESSAGE)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("AllFilesView verdict chip interaction", () => {
  it("dispatches set_draft_verdict when verdict is picked", async () => {
    fetchMock.mockResolvedValue(okResponse("# test"))
    renderAllFiles([[{ path: "f.md", artifact_id: null, content_hash: "hf" }]])
    const chip = await screen.findByRole("button", { name: /File verdict:/i })
    fireEvent.click(chip)
    const approveBtn = await screen.findByRole("button", { name: /Approve/ })
    fireEvent.click(approveBtn)
    await waitFor(() =>
      expect(setDraftVerdictDispatch).toHaveBeenCalledWith({ verdict: "approve" }),
    )
  })
})

describe("AllFilesView hideReviewed filter", () => {
  it("hides files that already have a verdict when hideReviewed is on", async () => {
    fetchMock.mockResolvedValue(okResponse("x"))
    uiStore.setHideReviewed(true)
    renderAllFiles([
      [{ path: "reviewed.md", artifact_id: "art-r", draft_verdict: "approve", current_round_hash: "hr" }],
      [{ path: "pending.md", artifact_id: null, content_hash: "hp" }],
    ])
    await waitFor(() => expect(screen.queryByText("reviewed.md")).not.toBeInTheDocument())
    expect(await screen.findByText("pending.md")).toBeInTheDocument()
  })

  it("shows all-reviewed notice when hideReviewed hides all files", async () => {
    uiStore.setHideReviewed(true)
    renderAllFiles([[{ path: "done.md", artifact_id: "art-d", draft_verdict: "approve", current_round_hash: "hd" }]])
    expect(await screen.findByText("All files reviewed")).toBeInTheDocument()
  })
})

describe("AllFilesView image rendering", () => {
  it("renders minted image via asset route (basename only, not full path)", async () => {
    renderAllFiles([[{ path: "icons/sub/logo.png", artifact_id: "art-img", current_round_hash: "himg" }]])
    const img = await screen.findByRole("img", { name: "icons/sub/logo.png" })
    expect(img.getAttribute("src")).toBe("/api/review/art-img/asset/logo.png")
  })
})
