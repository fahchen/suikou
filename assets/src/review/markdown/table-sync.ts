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

function sizeGroup(tables: HTMLTableElement[], cleanups: (() => void)[]) {
  const bodies = tables.map((t) => t.parentElement).filter((p): p is HTMLElement => p != null)

  // Reset to natural full-width layout, then measure each cell's content width
  // (scrollWidth reports what the text needs, ignoring the fixed-layout clip).
  const cells: HTMLTableCellElement[][] = []
  const widths: number[] = []
  for (const table of tables) {
    table.style.width = ""
    table.style.tableLayout = ""
    table.style.transform = ""
    table.querySelector("colgroup[data-sync-cols]")?.remove()
    const row = Array.from(table.rows[0]?.cells ?? [])
    row.forEach((cell) => (cell.style.whiteSpace = "nowrap"))
    cells.push(row)
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.scrollWidth + 2)
    })
  }

  const total = widths.reduce((sum, w) => sum + w, 0)
  const available = tables[0].clientWidth
  if (total <= available) {
    // Fits — leave the normal wrapping layout untouched.
    cells.forEach((row) => row.forEach((cell) => (cell.style.whiteSpace = "")))
    return
  }

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
    tables.forEach((table, i) => {
      table.style.width = ""
      table.style.tableLayout = ""
      table.querySelector("colgroup[data-sync-cols]")?.remove()
      cells[i].forEach((cell) => (cell.style.whiteSpace = ""))
    })
  })
}
