import { useEffect, type RefObject } from "react"

import { attachSyncScrollbar } from "./scroll-sync"

// Each logical table renders as one standalone `<table>` per row (so a row can
// carry its own line gutter and comment). Columns are aligned by giving every
// row-table identical, content-measured column widths. When the table overflows
// its container the whole group scrolls as one: a single scrollbar owns the
// offset and every row is shifted by the same `translateX`, so there is no
// per-row scroller to drift out of sync.
//
// ponytail: measures via layout reads per table row; fine for review-sized docs.
// If a doc ever carries huge tables and this shows in a profile, cache widths
// per gid or measure in an offscreen clone.
export function useTableSync(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const groups = new Map<string, HTMLTableElement[]>()
    for (const table of root.querySelectorAll<HTMLTableElement>("table.md-table-block[data-md-table]")) {
      const gid = table.dataset.mdTable ?? ""
      const bucket = groups.get(gid)
      if (bucket) bucket.push(table)
      else groups.set(gid, [table])
    }
    if (groups.size === 0) return

    const cleanups: (() => void)[] = []
    const layout = () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
      for (const tables of groups.values()) sizeGroup(tables, cleanups)
    }

    layout()
    window.addEventListener("resize", layout)
    return () => {
      window.removeEventListener("resize", layout)
      for (const cleanup of cleanups.splice(0)) cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Narrowest a column may be squeezed to before it stops being readable. A column
// whose content is already narrower than this (a digit, a short enum) is never
// squeezed at all — only columns holding more than this give up room.
const MIN_COLUMN_PX = 88

function sizeGroup(tables: HTMLTableElement[], cleanups: (() => void)[]) {
  const bodies = tables.map((t) => t.parentElement).filter((p): p is HTMLElement => p != null)

  // Reset to natural full-width layout, then measure each cell's content width
  // (scrollWidth reports what the text needs, ignoring the fixed-layout clip).
  const cells: HTMLTableCellElement[][] = []
  const natural: number[] = []
  for (const table of tables) {
    table.style.width = ""
    table.style.tableLayout = ""
    table.style.transform = ""
    table.querySelector("colgroup[data-sync-cols]")?.remove()
    const row = Array.from(table.rows[0]?.cells ?? [])
    row.forEach((cell) => (cell.style.whiteSpace = "nowrap"))
    cells.push(row)
    row.forEach((cell, i) => {
      natural[i] = Math.max(natural[i] ?? 0, cell.scrollWidth + 2)
    })
  }
  // Measured; let the cells wrap again so the solved widths can be honoured.
  cells.forEach((row) => row.forEach((cell) => (cell.style.whiteSpace = "")))

  const available = tables[0].clientWidth
  const widths = solveWidths(natural, available)
  const total = widths.reduce((sum, w) => sum + w, 0)
  // Columns are shared even when everything fits: each row is its own <table>, so
  // without this a row reading "1" and a row reading "10" size their first column
  // differently and the group's left edge steps in and out.
  for (const table of tables) {
    const colgroup = document.createElement("colgroup")
    colgroup.dataset.syncCols = "1"
    for (const width of widths) {
      const col = document.createElement("col")
      col.style.width = `${width}px`
      colgroup.appendChild(col)
    }
    table.insertBefore(colgroup, table.firstChild)
    table.style.tableLayout = "fixed"
    table.style.width = `${total}px`
  }

  // Wrapping absorbed the overflow — no scrollbar to hang, nothing to clip.
  if (total <= available) {
    cleanups.push(() => resetTables(tables, cells))
    return
  }

  for (const body of bodies) body.style.overflowX = "clip"

  // One scrollbar drives the whole group. Insert it above the first row, offset
  // by the gutter so it lines up with the table body.
  const firstRow = tables[0].parentElement?.parentElement
  if (!firstRow) return
  const gutter = (firstRow.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? 0
  const detach = attachSyncScrollbar({
    targets: tables,
    surfaces: bodies,
    extent: total,
    gutter,
    anchor: firstRow,
  })

  cleanups.push(() => {
    detach()
    for (const body of bodies) body.style.overflowX = ""
    resetTables(tables, cells)
  })
}

// Column widths for one group, given what each column needs on a single line.
//
// Fits: hand the slack out in proportion to what each column holds, so the prose
// column takes the room rather than the digit column.
//
// Doesn't fit: every column keeps the lesser of its content width and the floor,
// then the space that remains is split across only the columns that sit above
// that floor, in proportion to how far above they sit. Those columns wrap; the
// narrow ones are untouched. Wrapping is what absorbs the overflow, so the table
// still spans exactly the width available — no horizontal scrolling.
//
// Beyond that the floors themselves overflow (too many wide columns to fit any
// legible layout); the caller falls back to scrolling the group.
export function solveWidths(natural: number[], available: number): number[] {
  const total = natural.reduce((sum, w) => sum + w, 0)
  if (total <= 0 || available <= 0) return natural

  if (total <= available) {
    const slack = available - total
    return natural.map((w) => w + (slack * w) / total)
  }

  const floors = natural.map((w) => Math.min(w, MIN_COLUMN_PX))
  const floorTotal = floors.reduce((sum, w) => sum + w, 0)
  if (floorTotal >= available) return floors

  const excess = natural.map((w, i) => w - floors[i])
  const excessTotal = excess.reduce((sum, w) => sum + w, 0)
  if (excessTotal <= 0) return floors

  const slack = available - floorTotal
  return floors.map((floor, i) => floor + (slack * excess[i]) / excessTotal)
}

function resetTables(tables: HTMLTableElement[], cells: HTMLTableCellElement[][]) {
  tables.forEach((table, i) => {
    table.style.width = ""
    table.style.tableLayout = ""
    table.querySelector("colgroup[data-sync-cols]")?.remove()
    cells[i].forEach((cell) => (cell.style.whiteSpace = ""))
  })
}
