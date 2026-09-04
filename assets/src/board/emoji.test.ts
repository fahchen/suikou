import { describe, expect, it } from "vitest"

import { hashEmoji } from "./emoji"

const ids = Array.from({ length: 500 }, (_, i) => `0198c0f1-3b21-7c00-9a2f-2a1b3c4d5e${i}`)

describe("hashEmoji", () => {
  it("is stable for the same id", () => {
    expect(hashEmoji(ids[0])).toBe(hashEmoji(ids[0]))
  })

  it("spreads ids that differ by one character", () => {
    expect(new Set(ids.map(hashEmoji)).size).toBeGreaterThan(ids.length / 2)
  })

  it("never lands on a modifier or a text-presentation symbol", () => {
    for (const id of ids) {
      expect(hashEmoji(id)).toMatch(/^\p{Emoji_Presentation}$/u)
      expect(hashEmoji(id)).not.toMatch(/\p{Emoji_Component}/u)
    }
  })
})
