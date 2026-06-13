import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"

import type { Comment } from "../types"
import type { ReviewView } from "../store-context"
import { uiStore } from "../../stores/ui-store"
import { CommentCard } from "../CommentCard"

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
    unresolveComment: stubCmd,
    reply: stubCmd,
    submitReview: stubCmd,
    setDraftVerdict: stubCmd,
    selectRound: stubCmd
  })
}))

import { HtmlView } from "./HtmlView"

function makeView(content: string, comments: Comment[] = []): ReviewView {
  return {
    content,
    contentError: null,
    loading: false,
    comments,
    blocks: [],
    previewable: false,
    rawLines: null,
    snapshot: {
      artifact: { id: "art1", title: "page.html" }
    } as ReviewView["snapshot"]
  }
}

async function loadedIframe(body: string): Promise<HTMLIFrameElement> {
  const iframe = (await screen.findByTitle("page.html")) as HTMLIFrameElement
  await waitFor(() => {
    expect(iframe.contentDocument?.body).toBeTruthy()
  })
  // jsdom's srcdoc parsing varies; seed the body directly so the iframe DOM
  // matches the artifact the test claims to be reviewing. The onLoad callback
  // already fired against the parsed srcdoc, so subsequent setDocVersion is
  // driven by the act() flush after we mutate the DOM.
  iframe.contentDocument!.body.innerHTML = body
  return iframe
}

function selectInside(doc: Document, el: Element, text: string): void {
  const mockSelection = {
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => ({ commonAncestorContainer: el } as unknown as Range),
    toString: () => text
  } as unknown as Selection
  doc.getSelection = () => mockSelection
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  dispatch.mockReset()
  uiStore.setOutdatedElementCommentIds(new Set())
})

describe("HtmlView", () => {
  it("renders the iframe with sandbox=allow-same-origin and NO allow-scripts", async () => {
    render(
      <HtmlView view={makeView("<p>hi</p>")} forceRaw={false} inline={true} />
    )
    const iframe = await screen.findByTitle("page.html")
    const sandbox = iframe.getAttribute("sandbox") ?? ""
    expect(sandbox).toBe("allow-same-origin")
    expect(sandbox).not.toMatch(/allow-scripts/)
  })

  it("injects a <base> tag pointing at the artifact asset route", async () => {
    render(
      <HtmlView view={makeView("<p>hi</p>")} forceRaw={false} inline={true} />
    )
    const iframe = (await screen.findByTitle("page.html")) as HTMLIFrameElement
    const srcdoc = iframe.getAttribute("srcdoc") ?? ""
    expect(srcdoc).toMatch(/<base href="\/api\/review\/art1\/asset\/">/)
  })

  it("opens the composer on selection and dispatches an element anchor", async () => {
    render(
      <HtmlView
        view={makeView(`<p id="hello">hello world</p>`)}
        forceRaw={false}
        inline={true}
      />
    )
    const iframe = await loadedIframe(`<p id="hello">hello world</p>`)
    const doc = iframe.contentDocument!
    const p = doc.getElementById("hello")!

    selectInside(doc, p, "hello")
    doc.dispatchEvent(new doc.defaultView!.Event("mouseup", { bubbles: true }))
    await flushMicrotasks()

    await screen.findByText(/New comment on selected region/)

    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), {
      target: { value: "fix this heading" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Fix required" }))
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))

    expect(dispatch).toHaveBeenCalledWith({
      scope: "located",
      critique_type: "fix_required",
      body: "fix this heading",
      anchor: { type: "element", selector: "#hello", quote: "hello" }
    })
    // Composer closes after dispatch.
    await waitFor(() =>
      expect(screen.queryByText(/New comment on selected region/)).toBeNull()
    )
  })

  it("renders an element comment as outdated when its selector misses", async () => {
    const carried: Comment = {
      id: "c-outdated",
      anchor: { type: "element", selector: "#gone", quote: "missing" },
      body: "this no longer applies",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      carried: true,
      original_round: 1,
      resolved_round: null,
      inserted_at: "2026-06-14T00:00:00Z",
      scope: "located",
      replies: []
    } as unknown as Comment

    render(
      <HtmlView
        view={makeView(`<p id="kept">still here</p>`, [carried])}
        forceRaw={false}
        inline={true}
      />
    )

    await loadedIframe(`<p id="kept">still here</p>`)
    await waitFor(() =>
      expect(screen.getByText(/Lost its anchor/)).toBeInTheDocument()
    )
  })

  it("publishes outdated element-comment ids so the rail badge matches inline", async () => {
    const carried: Comment = {
      id: "c-outdated-rail",
      anchor: { type: "element", selector: "#gone", quote: "missing" },
      body: "this no longer applies",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      carried: true,
      original_round: 1,
      resolved_round: null,
      inserted_at: "2026-06-14T00:00:00Z",
      scope: "located",
      replies: []
    } as unknown as Comment

    render(
      <>
        <HtmlView
          view={makeView(`<p id="kept">still here</p>`, [carried])}
          forceRaw={false}
          inline={false}
        />
        <CommentCard comment={carried} context="rail" />
      </>
    )

    await loadedIframe(`<p id="kept">still here</p>`)
    await waitFor(() =>
      expect(uiStore.outdatedElementCommentIds.has("c-outdated-rail")).toBe(true)
    )
    expect(screen.getByText(/Lost its anchor/)).toBeInTheDocument()
  })

  it("does NOT render anchored element comments inline when inline=false", async () => {
    const located: Comment = {
      id: "c-located",
      anchor: { type: "element", selector: "#kept", quote: "still" },
      body: "rail-only payload",
      critique_type: "note",
      status: "published",
      resolved: false,
      outdated: false,
      carried: false,
      original_round: null,
      resolved_round: null,
      inserted_at: "2026-06-14T00:00:00Z",
      scope: "located",
      replies: []
    } as unknown as Comment

    render(
      <HtmlView
        view={makeView(`<p id="kept">still here</p>`, [located])}
        forceRaw={false}
        inline={false}
      />
    )
    await loadedIframe(`<p id="kept">still here</p>`)
    expect(screen.queryByText("rail-only payload")).toBeNull()
  })
})
