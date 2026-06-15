import { describe, expect, it } from "vitest"

import { badgePop, commitPulse, EASE_OUT_QUINT } from "./motion"

describe("badgePop", () => {
  it("returns inert props under reduced motion", () => {
    expect(badgePop(true)).toEqual({})
  })

  it("returns an entrance pop when motion is allowed", () => {
    expect(badgePop(false)).toEqual({
      initial: { opacity: 0, scale: 0.5 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.24, ease: EASE_OUT_QUINT },
    })
  })
})

describe("commitPulse", () => {
  it("returns null under reduced motion", () => {
    expect(commitPulse(true)).toBeNull()
  })

  it("returns a pulse keyframe when motion is allowed", () => {
    expect(commitPulse(false)).toEqual({ scale: [1, 1.12, 1] })
  })
})
