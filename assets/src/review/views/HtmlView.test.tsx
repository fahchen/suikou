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
    } as unknown as ReviewView["snapshot"],
    reviewKind: "file",
    reviewSnapshot: {} as unknown as ReviewView["reviewSnapshot"],
    verdict: "comment",
    onVerdictChange: () => undefined
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
  uiStore.closeComposer()
})

describe("HtmlView", () => {
  it("survives loading→loaded without changing hook count (regression)", async () => {
    // Console.error fails the test on a React invariant like "Rendered more
    // hooks than during the previous render". Captures it explicitly so the
    // failure mode is loud even if the component still returns a fallback.
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args) => {
      errors.push(args)
      original.apply(console, args as Parameters<typeof console.error>)
    }
    try {
      const initial = makeView("")
      const loadingView: ReviewView = { ...initial, loading: true }
      const { rerender } = render(
        <HtmlView view={loadingView} forceRaw={false} inline={true} />
      )
      // Loading placeholder rendered (hook count = baseline).
      await screen.findByText("Loading…")
      // Content arrives → component falls through to the iframe path; this
      // is the render that previously crashed because matchingComments's
      // useMemo lived below the early returns.
      rerender(
        <HtmlView
          view={makeView(`<p id="hi">hi</p>`)}
          forceRaw={false}
          inline={true}
        />
      )
      await screen.findByTitle("page.html")
      const hookError = errors.find((args) =>
        JSON.stringify(args).includes("Rendered more hooks")
      )
      expect(hookError).toBeUndefined()
    } finally {
      console.error = original
    }
  })

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

  it("opens the composer from a touch-driven selectionchange (no mouseup)", async () => {
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
    // Touch text-selection finalizes via selectionchange, never a mouseup.
    doc.dispatchEvent(new doc.defaultView!.Event("selectionchange", { bubbles: true }))

    await screen.findByText(/New comment on selected region/, undefined, { timeout: 2000 })
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
      authored_round: 1,
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
      authored_round: 1,
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

  it("paints the hover highlight class on the element under the cursor", async () => {
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

    const move = new doc.defaultView!.Event("pointermove", { bubbles: true }) as PointerEvent
    Object.defineProperty(move, "target", { value: p })
    doc.dispatchEvent(move)
    await flushMicrotasks()

    expect(p.classList.contains("suikou-hover-highlight")).toBe(true)
  })

  it("opens a popover composer when an element is clicked (no text selection)", async () => {
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

    // No active selection -> click path; mock so it reports collapsed.
    doc.getSelection = () => ({ isCollapsed: true, rangeCount: 0, toString: () => "" } as unknown as Selection)

    const click = new doc.defaultView!.Event("click", { bubbles: true }) as MouseEvent
    Object.defineProperty(click, "target", { value: p })
    doc.dispatchEvent(click)
    await flushMicrotasks()

    const dialog = await screen.findByRole("dialog", { name: /element comment/i })
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent ?? "").toMatch(/hello world/)
  })

  it("publishes the targeted anchor to ui-store when inline=false (side mode)", async () => {
    render(
      <HtmlView
        view={makeView(`<p id="hello">hello world</p>`)}
        forceRaw={false}
        inline={false}
      />
    )
    const iframe = await loadedIframe(`<p id="hello">hello world</p>`)
    const doc = iframe.contentDocument!
    const p = doc.getElementById("hello")!

    doc.getSelection = () => ({ isCollapsed: true, rangeCount: 0, toString: () => "" } as unknown as Selection)
    const click = new doc.defaultView!.Event("click", { bubbles: true }) as MouseEvent
    Object.defineProperty(click, "target", { value: p })
    doc.dispatchEvent(click)
    await flushMicrotasks()

    await waitFor(() => {
      expect(uiStore.htmlAnchorTarget).not.toBeNull()
    })
    expect(uiStore.htmlAnchorTarget?.selector).toBe("#hello")
    expect(uiStore.htmlAnchorTarget?.quote).toMatch(/hello world/)
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
      authored_round: 0,
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

  it("zoom controls step the level and clamp at the bounds", async () => {
    render(
      <HtmlView view={makeView("<p>hi</p>")} forceRaw={false} inline={true} />
    )
    await screen.findByTitle("page.html")

    expect(screen.getByText("100%")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("110%")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }))
    expect(screen.getByText("100%")).toBeInTheDocument()

    // Step down to the 50% floor; the button disables once clamped.
    const zoomOut = screen.getByRole("button", { name: "Zoom out" })
    for (let i = 0; i < 10; i++) fireEvent.click(zoomOut)
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(zoomOut).toBeDisabled()
  })

  it("toggles a fullscreen overlay and exits on Escape", async () => {
    render(
      <HtmlView view={makeView("<p>hi</p>")} forceRaw={false} inline={true} />
    )
    await screen.findByTitle("page.html")
    const frame = screen.getByLabelText("Rendered HTML preview")
    expect(frame.className).not.toMatch(/fixed/)

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }))
    expect(frame.className).toMatch(/fixed/)
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(frame.className).not.toMatch(/fixed/)
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument()
  })

  it("forceRaw: opens the line composer and dispatches a line_range anchor", async () => {
    render(
      <HtmlView
        view={makeView("<p>one</p>\n<p>two</p>")}
        forceRaw={true}
        inline={true}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Add a comment on line 2" }))
    await screen.findByText(/New comment on line 2/)

    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), {
      target: { value: "tighten this tag" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }))

    expect(dispatch).toHaveBeenCalledWith({
      scope: "located",
      critique_type: "note",
      body: "tighten this tag",
      anchor: { type: "line_range", start_line: 2, end_line: 2 }
    })
  })
})
