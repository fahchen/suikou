import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"

import { ReviewStoreProvider } from "./store-context"
import { useReviewCommands } from "./commands"
import type { ReviewStore } from "./types"

// Minimal stand-ins for a Musubi store proxy: the command hook only ever touches
// `dispatchCommand` and the internal `__musubi_store_id__` (the latter solely on
// the library's error path).
function fakeChild(id: string[]) {
  return {
    __musubi_store_id__: id,
    dispatchCommand: vi.fn(async () => ({}))
  }
}

type FakeChild = ReturnType<typeof fakeChild>

/**
 * A root proxy whose `comments` child field is *live*: it returns whatever the
 * mutable cell currently holds. This reproduces the production behavior where
 * `store.comments` is a lazily-resolved proxy field that momentarily reads
 * `undefined` during a store teardown/swap window — even while the snapshot the
 * shell guards on still shows the artifact.
 */
function fakeRoot(commentsCell: { current: FakeChild | undefined }): ReviewStore {
  return {
    __musubi_store_id__: ["root"],
    dispatchCommand: vi.fn(async () => ({})),
    get comments() {
      return commentsCell.current
    }
  } as unknown as ReviewStore
}

function Harness(props: { onDispatch: (p: Promise<unknown>) => void }) {
  const commands = useReviewCommands()
  return (
    <button
      onClick={() =>
        props.onDispatch(
          commands.addComment.dispatch({
            scope: "located",
            critique_type: "note",
            body: "x",
            anchor: { type: "line_range", start_line: 1, end_line: 1 }
          })
        )
      }
    >
      add
    </button>
  )
}

describe("useReviewCommands comment dispatch resilience", () => {
  it("keeps dispatching at a valid comments child after a transient undefined read", async () => {
    const child = fakeChild(["root", "comments"])
    const cell: { current: FakeChild | undefined } = { current: child }
    const store = fakeRoot(cell)

    let captured: Promise<unknown> | null = null
    const onDispatch = (p: Promise<unknown>) => {
      captured = p
    }

    const view = render(
      <ReviewStoreProvider store={store}>
        <Harness onDispatch={onDispatch} />
      </ReviewStoreProvider>
    )

    // The teardown/swap window: the live `store.comments` field now reads
    // undefined, but the component tree (here, the button) is still mounted —
    // exactly the inconsistency the shell's snapshot guard cannot catch.
    cell.current = undefined
    view.rerender(
      <ReviewStoreProvider store={store}>
        <Harness onDispatch={onDispatch} />
      </ReviewStoreProvider>
    )

    fireEvent.click(view.getByRole("button", { name: "add" }))

    // Before the fix this rejects with "Cannot read properties of undefined
    // (reading '__musubi_store_id__')" because the dispatch was bound to an
    // undefined proxy. After the fix the dispatch targets the retained child.
    await expect(captured!).resolves.toBeDefined()
    expect(child.dispatchCommand).toHaveBeenCalledWith("add_comment", {
      scope: "located",
      critique_type: "note",
      body: "x",
      anchor: { type: "line_range", start_line: 1, end_line: 1 }
    })
  })
})
