import { describe, it, expect } from "vitest"

import { mergeOptimistic } from "./store-context"
import type { Comment } from "./types"

const comment = (id: string, body: string, line: number | null): Comment =>
  ({
    id,
    body,
    anchor: line === null ? null : { type: "line_range", start_line: line, end_line: line, quote: "" },
  }) as unknown as Comment

describe("mergeOptimistic", () => {
  it("appends an optimistic comment the server thread does not yet have", () => {
    const server = [comment("s1", "existing", 1)]
    const pending = [comment("opt1", "fresh take", 4)]
    expect(mergeOptimistic(server, pending).map((c) => c.id)).toEqual(["s1", "opt1"])
  })

  it("drops an optimistic comment once its match (body + anchor) is in the thread", () => {
    const server = [comment("s1", "fresh take", 4)]
    const pending = [comment("opt1", "fresh take", 4)]
    expect(mergeOptimistic(server, pending).map((c) => c.id)).toEqual(["s1"])
  })

  it("keeps an optimistic comment whose body matches but anchor differs", () => {
    const server = [comment("s1", "fresh take", 9)]
    const pending = [comment("opt1", "fresh take", 4)]
    expect(mergeOptimistic(server, pending).map((c) => c.id)).toEqual(["s1", "opt1"])
  })

  it("returns the server list unchanged when there is nothing pending", () => {
    const server = [comment("s1", "existing", 1)]
    expect(mergeOptimistic(server, [])).toBe(server)
  })
})
