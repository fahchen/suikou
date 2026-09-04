import { describe, expect, it } from "vitest"

import { anchorBox } from "./HtmlSurface"

const rect = (top: number, height: number) => ({ top, left: 10, right: 110, bottom: top + height, width: 100, height })

describe("anchorBox", () => {
  it("keeps a visible target where it is", () => {
    expect(anchorBox(rect(200, 60), 1, 900)).toEqual({ left: 10, top: 200, width: 100, height: 60 })
  })

  it("rests against the top edge once the target scrolls above it", () => {
    expect(anchorBox(rect(-400, 60), 1, 900)).toMatchObject({ top: 0, height: 1 })
  })

  it("rests against the bottom edge once the target scrolls below it", () => {
    expect(anchorBox(rect(1200, 60), 1, 900)).toMatchObject({ top: 899, height: 1 })
  })

  it("anchors a target taller than the frame to a band at its visible top", () => {
    expect(anchorBox(rect(-100, 2000), 1, 900)).toEqual({ left: 10, top: 0, width: 100, height: 300 })
  })

  it("scales the reported rect by the zoom level", () => {
    expect(anchorBox(rect(100, 50), 2, 900)).toMatchObject({ left: 20, top: 200, width: 200, height: 100 })
  })
})
