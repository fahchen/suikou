import { describe, expect, test } from "vitest"

import { solveWidths } from "./table-sync"

// Column widths a row-group needs on one line, per scenario in
// docs/table-render-test.md. Each case names the section it mirrors, so a
// rendering surprise in the browser has a unit test to reproduce it in.
const PANE = 600
const FLOOR = 88

const sum = (widths: number[]) => widths.reduce((total, width) => total + width, 0)

describe("solveWidths", () => {
  describe("fits in the pane", () => {
    test("§1 two short columns fill the pane instead of hugging the left", () => {
      const widths = solveWidths([40, 40], PANE)

      expect(sum(widths)).toBeCloseTo(PANE)
      expect(widths[0]).toBeCloseTo(widths[1])
    })

    test("§3 a digit column and two words keep their proportions", () => {
      const widths = solveWidths([40, 70, 60], PANE)

      expect(sum(widths)).toBeCloseTo(PANE)
      // Slack is shared out in proportion, so the order of column widths holds.
      expect(widths[1]).toBeGreaterThan(widths[2])
      expect(widths[2]).toBeGreaterThan(widths[0])
    })

    test("§5 five medium columns, none dominant", () => {
      const widths = solveWidths([70, 70, 60, 110, 260], PANE)

      expect(sum(widths)).toBeCloseTo(PANE)
      expect(widths.every((width) => width > 0)).toBe(true)
    })

    test("§6 six short columns are all under the floor and none is squeezed", () => {
      const natural = [30, 35, 28, 45, 50, 55]
      const widths = solveWidths(natural, PANE)

      expect(sum(widths)).toBeCloseTo(PANE)
      // Everything fits, so every column ends up at least as wide as it needs —
      // nothing is forced to wrap.
      natural.forEach((want, i) => expect(widths[i]).toBeGreaterThanOrEqual(want))
    })
  })

  describe("wrapping absorbs the overflow", () => {
    test("§2 the prose column gives up room, the label column keeps its width", () => {
      const widths = solveWidths([50, 900], PANE)

      expect(widths[0]).toBe(50)
      expect(sum(widths)).toBeCloseTo(PANE)
    })

    test("§4 digit and enum columns hold while the finding column is squeezed", () => {
      const widths = solveWidths([40, 80, 110, 1200], PANE)

      // Both sit under the floor, so neither moves however tight it gets.
      expect(widths[0]).toBe(40)
      expect(widths[1]).toBe(80)
      // The two above the floor give ground, the widest giving the most.
      expect(widths[2]).toBeLessThan(110)
      expect(widths[3]).toBeLessThan(1200)
      expect(widths[3] - FLOOR).toBeGreaterThan(widths[2] - FLOOR)
      expect(sum(widths)).toBeCloseTo(PANE)
    })

    test("§7 one enormous cell wraps deeply, its neighbours do not move", () => {
      const widths = solveWidths([50, 60, 2000], PANE)

      expect(widths[0]).toBe(50)
      expect(widths[1]).toBe(60)
      expect(sum(widths)).toBeCloseTo(PANE)
    })

    test("§8 a column of unbreakable tokens is squeezed like any other", () => {
      const widths = solveWidths([60, 1400], PANE)

      expect(widths[0]).toBe(60)
      expect(widths[1]).toBeGreaterThanOrEqual(FLOOR)
      // Never wider than the pane — CSS overflow-wrap breaks the token instead.
      expect(sum(widths)).toBeCloseTo(PANE)
    })

    test("never exceeds the pane, so no group wraps *and* scrolls", () => {
      for (const natural of [
        [50, 900],
        [40, 80, 110, 1200],
        [50, 60, 2000],
        [60, 1400],
      ]) {
        expect(sum(solveWidths(natural, PANE))).toBeLessThanOrEqual(PANE + 0.01)
      }
    })
  })

  describe("falls back to scrolling", () => {
    test("§9 nine columns cannot fit even at the floor, so the group scrolls", () => {
      const natural = [40, 80, 90, 60, 60, 80, 80, 110, 320]
      const widths = solveWidths(natural, PANE)

      // Each column keeps the lesser of its content width and the floor…
      expect(widths).toEqual([40, 80, FLOOR, 60, 60, 80, 80, FLOOR, FLOOR])
      // …and the total overflows, which is the caller's cue to hang a scrollbar.
      expect(sum(widths)).toBeGreaterThan(PANE)
    })
  })

  test("leaves widths alone before the container has been measured", () => {
    expect(solveWidths([100, 200], 0)).toEqual([100, 200])
  })
})
