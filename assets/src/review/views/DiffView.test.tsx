import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import type { Comment } from "../types"
import type { ReviewView } from "../store-context"
import { uiStore } from "../../stores/ui-store"

// jsdom omits matchMedia, but rendering an anchored CommentCard pulls in
// CommentReplyComposer -> useMediaQuery, which calls it.
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

const dispatch = vi.fn()

const stubCmd = { dispatch: vi.fn(), isPending: false }

vi.mock("../commands", () => ({
  useReviewCommands: () => ({
    addComment: { dispatch, isPending: false },
    editComment: stubCmd,
    deleteComment: stubCmd,
    resolveComment: stubCmd,
    reply: stubCmd,
    submitReview: stubCmd,
    setDraftVerdict: stubCmd,
    selectRound: stubCmd
  })
}))

import { DiffView } from "./DiffView"

function makeView(content: string, comments: Comment[] = []): ReviewView {
  return {
    content,
    contentError: null,
    etag: "",
    loading: false,
    comments,
    blocks: [],
    previewable: false,
    rawLines: null,
    // `.txt` has no grammar, so diff highlighting is a no-op and lines stay plain
    // text — the assertions below match on raw line text.
    snapshot: {
      artifact: { id: "", title: "notes.txt" },
      current_round: { content_hash: null },
      content_hash: null
    } as unknown as ReviewView["snapshot"],
    reviewKind: "file",
    reviewSnapshot: {} as unknown as ReviewView["reviewSnapshot"],
    verdict: "comment",
    onVerdictChange: () => undefined
  }
}

const DIFF = ["@@ -1,2 +1,2 @@", " keep", "-old line", "+new line"].join("\n")

beforeEach(() => {
  dispatch.mockReset()
})

describe("DiffView", () => {
  it("renders both sides with their own line numbers", () => {
    render(<DiffView view={makeView(DIFF)} forceSource={false} inline={true} />)
    // Each side carries lines 1..2; old keeps `keep` then `old line`, new keeps
    // `keep` then `new line`. Line gutters render as buttons.
    expect(screen.getByRole("button", { name: /old line 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /new line 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /old line 2/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /new line 2/i })).toBeInTheDocument()
    expect(screen.getByText("old line")).toBeInTheDocument()
    expect(screen.getByText("new line")).toBeInTheDocument()
  })

  it("shows the no-changes notice when the diff is empty", () => {
    render(<DiffView view={makeView("")} forceSource={false} inline={true} />)
    expect(screen.getByText(/No changes/)).toBeInTheDocument()
  })

  it("opens the diff-hunk composer when the reviewer clicks a gutter", () => {
    render(<DiffView view={makeView(DIFF)} forceSource={false} inline={true} />)
    fireEvent.click(screen.getByRole("button", { name: /new line 2/i }))
    expect(screen.getByText(/New comment on new line 2/)).toBeInTheDocument()
  })

  it("dispatches add_comment with a diff_hunk anchor carrying side + lines", () => {
    render(<DiffView view={makeView(DIFF)} forceSource={false} inline={true} />)
    fireEvent.click(screen.getByRole("button", { name: /new line 2/i }))

    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), {
      target: { value: "rename this" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Fix required" }))
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))

    expect(dispatch).toHaveBeenCalledWith({
      scope: "located",
      critique_type: "fix_required",
      body: "rename this",
      anchor: { type: "diff_hunk", side: "new", start_line: 2, end_line: 2 }
    })
    // Composer closes after dispatch.
    expect(screen.queryByText(/New comment on new line 2/)).toBeNull()
  })

  it("extends the selection within one side on shift-click", () => {
    const wider = ["@@ -1,3 +1,3 @@", "-a", "-b", "-c", "+A", "+B", "+C"].join("\n")
    render(<DiffView view={makeView(wider)} forceSource={false} inline={true} />)
    fireEvent.click(screen.getByRole("button", { name: /old line 1/i }))
    fireEvent.click(screen.getByRole("button", { name: /old line 3/i }), { shiftKey: true })

    expect(screen.getByText(/New comment on old lines 1-3/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), {
      target: { value: "ok" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: { type: "diff_hunk", side: "old", start_line: 1, end_line: 3 }
      })
    )
  })

  it("renders an anchored diff_hunk comment next to its row in inline mode", () => {
    const comment = {
      id: "c1",
      anchor: { type: "diff_hunk", side: "new", start_line: 2, end_line: 2, quote: "new line" },
      body: "looks off",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      drifted: false,
      authored_round: 0,
      inserted_at: "2026-06-14T00:00:00Z",
      replies: []
    } as unknown as Comment

    render(<DiffView view={makeView(DIFF, [comment])} forceSource={false} inline={true} />)
    expect(screen.getByText("looks off")).toBeInTheDocument()
  })

  it("renders an unanchored comment at the top in inline mode", () => {
    const comment = {
      id: "c2",
      anchor: null,
      body: "general note",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      drifted: false,
      authored_round: 0,
      inserted_at: "2026-06-14T00:00:00Z",
      replies: []
    } as unknown as Comment

    render(<DiffView view={makeView(DIFF, [comment])} forceSource={false} inline={true} />)
    expect(screen.getByText("general note")).toBeInTheDocument()
  })

  it("renders an outdated diff_hunk comment as a fallback when its line is gone", () => {
    // Stale anchor points at a line the live diff no longer has; without the
    // fallback it would render nowhere. start_line 99 matches no row.
    const comment = {
      id: "c-stale",
      anchor: { type: "diff_hunk", side: "new", start_line: 99, end_line: 99, quote: "gone" },
      body: "stale note",
      critique_type: "fix_required",
      status: "published",
      resolved: false,
      outdated: true,
      authored_round: 0,
      inserted_at: "2026-06-14T00:00:00Z",
      replies: []
    } as unknown as Comment

    render(<DiffView view={makeView(DIFF, [comment])} forceSource={false} inline={true} />)
    expect(screen.getByText("stale note")).toBeInTheDocument()
  })

  it("renders a unified layout when the screen is narrow (matchMedia is false)", () => {
    // Defaults: matchMedia(wide) returns false → layout falls back to unified
    // regardless of uiStore.diffLayout. The unified row carries a +/- marker.
    uiStore.setDiffLayout("side")
    render(<DiffView view={makeView(DIFF)} forceSource={false} inline={true} />)
    expect(screen.getByText("+")).toBeInTheDocument()
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("hides anchored comments when inline is false (rail mode)", () => {
    const comment = {
      id: "c3",
      anchor: { type: "diff_hunk", side: "new", start_line: 2, end_line: 2, quote: "new line" },
      body: "rail-only",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      drifted: false,
      authored_round: 0,
      inserted_at: "2026-06-14T00:00:00Z",
      replies: []
    } as unknown as Comment

    const view = makeView(DIFF, [comment])
    const { container } = render(<DiffView view={view} forceSource={false} inline={false} />)
    expect(within(container).queryByText("rail-only")).toBeNull()
  })
})
