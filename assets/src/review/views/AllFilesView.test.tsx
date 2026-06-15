import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { AllFilesView } from "./AllFilesView"
import { uiStore } from "../../stores/ui-store"
import type { ReviewSnapshot } from "../types"

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
})

// Stub the markdown router to a no-op renderer so the body picks the raw / diff
// branches by content alone.
vi.mock("../../markdown/use-markdown", () => ({
  useMarkdown: () => ({ blocks: [], loading: false })
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => undefined
}))

// StackedVerdictChip reaches into the review store + view context, neither of
// which is mounted in these unit tests. The chip's behavior is exercised in
// browser acceptance; here we stub them so AllFilesView renders.
const stub = { dispatch: vi.fn(), isPending: false }
const setFileDraftVerdictDispatch = vi.fn(async () => ({
  artifact_id: "a-stub",
  error: null
}))

vi.mock("../commands", () => ({
  useReviewCommands: () => ({
    openFile: { dispatch: vi.fn() },
    addFileComment: { dispatch: vi.fn(), isPending: false },
    addComment: stub,
    editComment: stub,
    deleteComment: stub,
    resolveComment: stub,
    unresolveComment: stub,
    reply: stub,
    submitReview: stub,
    setDraftVerdict: stub,
    setFileDraftVerdict: { dispatch: setFileDraftVerdictDispatch, isPending: false },
    selectRound: stub
  }),
  ReviewCommandsOverrideContext: { Provider: (props: { children: React.ReactNode }) => props.children }
}))

vi.mock("../store-context", async () => {
  const actual = await vi.importActual<typeof import("../store-context")>(
    "../store-context"
  )
  return {
    ...actual,
    useReviewView: () => ({
      snapshot: {} as never,
      verdict: "comment" as const,
      onVerdictChange: () => undefined
    })
  }
})

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  // Default route: minted file content fetch (artifact id).
  // Tests that need different responses override per call.
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

function snapshot(files: ReviewSnapshot["files"]["data"]): ReviewSnapshot {
  return {
    review_id: "rv-1",
    artifact: { id: "a-1", title: "x.md", kind: "file", approved: false, approved_round: null },
    artifacts: [],
    rounds: [],
    current_round: { number: 0, content_hash: "", is_latest: true },
    comments: { items: [] } as unknown as ReviewSnapshot["comments"],
    latest_verdict: null,
    draft_verdict: null,
    files: { __musubi_async__: true, status: "ok", result: files, reason: null, data: files },
    files_comments: []
    // `data` mirrors `result` here because the React store helper exposes the
    // async value under that key in this build.
  } as unknown as ReviewSnapshot
}

function renderAllFiles(files: ReviewSnapshot["files"]["data"]) {
  return render(
    <AllFilesView
      snapshot={snapshot(files)}
      verdict="comment"
      onVerdictChange={() => undefined}
    />
  )
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200 })
}

function notFoundResponse(): Response {
  return new Response("", { status: 404 })
}

describe("AllFilesView (inactive verdict)", () => {
  it("commits a verdict on an inactive card in place — chip flips, no pendingVerdict, no navigation", async () => {
    setFileDraftVerdictDispatch.mockClear()
    fetchMock.mockResolvedValue(okResponse("# inactive"))

    // Render two files: the snapshot's `artifact.id` is `a-1`, so the second
    // row (artifact_id `a-other`) is the inactive card. We click its chip and
    // pick a verdict that differs from its snapshot value.
    render(
      <AllFilesView
        snapshot={snapshot([
          {
            path: "active.md",
            artifact_id: "a-1",
            approved: false,
            verdict: null,
            content_hash: "h1",
            change_status: null
          },
          {
            path: "other.md",
            artifact_id: "a-other",
            approved: false,
            verdict: null,
            content_hash: "h2",
            change_status: null
          }
        ])}
        verdict="comment"
        onVerdictChange={() => undefined}
      />
    )

    // Open the inactive card's verdict popover and pick "Approve".
    const triggers = await screen.findAllByRole("button", { name: /File verdict:/})
    expect(triggers.length).toBe(2)
    const inactiveTrigger = triggers[1]
    fireEvent.click(inactiveTrigger)
    const approveOption = await screen.findByRole("button", { name: /Approve/ })
    fireEvent.click(approveOption)

    await waitFor(() =>
      expect(setFileDraftVerdictDispatch).toHaveBeenCalledWith({
        path: "other.md",
        verdict: "approve"
      })
    )
    // Inactive chip label flips immediately (optimistic), even though
    // `file.verdict` is still null in the snapshot.
    await waitFor(() => {
      const updated = screen.getAllByRole("button", { name: /File verdict:/})
      expect(updated[1].getAttribute("aria-label")).toMatch(/Approve/)
    })
    // The legacy cross-shell handoff must NOT fire.
    expect((uiStore as unknown as { pendingVerdict?: unknown }).pendingVerdict).toBeUndefined()
  })
})

describe("AllFilesView", () => {
  it("fetches unminted rows by review-id + path using the content-by-path route", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("# Hello, unminted"))

    renderAllFiles([
      { path: "docs/plan.md", artifact_id: null, approved: false, verdict: null, content_hash: "h1", change_status: null }
    ])

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe("/api/review/rv-1/files/content?path=docs%2Fplan.md")
  })

  it("fetches minted rows by artifact id (not the by-path route)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("plain text"))

    renderAllFiles([
      { path: "docs/plan.md", artifact_id: "a-99", approved: false, verdict: null, content_hash: "h1", change_status: null }
    ])

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe("/api/review/a-99/content")
  })

  it("renders the content-unavailable placeholder when the content route 404s", async () => {
    fetchMock.mockResolvedValueOnce(notFoundResponse())

    renderAllFiles([
      { path: "deleted.md", artifact_id: null, approved: false, verdict: null, content_hash: null, change_status: null }
    ])

    expect(await screen.findByText("Content unavailable.")).toBeInTheDocument()
    // 404 must not retry — exactly one fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("renders a minted image under a subdirectory at /asset/<basename> (no path segments)", async () => {
    renderAllFiles([
      { path: "icons/sub/foo.png", artifact_id: "art-9", approved: false, verdict: null, content_hash: "h1", change_status: null }
    ])
    const img = await screen.findByRole("img", { name: "icons/sub/foo.png" })
    expect(img.getAttribute("src")).toBe("/api/review/art-9/asset/foo.png")
  })

  it("exposes the shared file verdict menu chip per stacked file (not the legacy bespoke chip)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("# stacked"))
    renderAllFiles([
      { path: "docs/plan.md", artifact_id: null, approved: false, verdict: null, content_hash: "h1", change_status: null }
    ])
    // FileVerdictMenu's trigger uses `${scopePrefix} — ${VERDICT_META[verdict].label}`.
    const chip = await screen.findByRole("button", { name: /File verdict:/})
    expect(chip).toBeInTheDocument()
  })
})
