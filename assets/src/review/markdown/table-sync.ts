import { useEffect, type RefObject } from "react"

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
    table.style.transform = "translateX(0)"
    table.style.willChange = "transform"
  }
  for (const body of bodies) body.style.overflowX = "clip"

  // One scrollbar drives the whole group. Insert it above the first row, offset
  // by the gutter so it lines up with the table body.
  const firstRow = tables[0].parentElement?.parentElement
  const gutter = (firstRow?.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? 0
  const bar = document.createElement("div")
  bar.dataset.syncBar = "1"
  bar.className = "md-table-hscroll"
  bar.style.marginLeft = `${gutter}px`
  const spacer = document.createElement("div")
  spacer.style.width = `${total}px`
  spacer.style.height = "1px"
  bar.appendChild(spacer)
  firstRow?.parentNode?.insertBefore(bar, firstRow)

  const apply = () => {
    const left = bar.scrollLeft
    for (const table of tables) table.style.transform = `translateX(${-left}px)`
  }
  bar.addEventListener("scroll", apply)

  // Forward wheel/touch over any row to the single scrollbar, so the group can
  // be panned from the content, not only by dragging the bar.
  const onWheel = (event: WheelEvent) => {
    const dx = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : 0
    if (dx === 0) return
    const before = bar.scrollLeft
    bar.scrollLeft = before + dx
    if (bar.scrollLeft !== before) event.preventDefault()
  }
  let startX = 0
  let startY = 0
  let axis: "?" | "x" | "y" = "?"
  let lastX = 0
  let lastT = 0
  let velocity = 0
  let raf = 0
  const glide = () => {
    const now = performance.now()
    const dt = Math.max(1, now - lastT)
    lastT = now
    const before = bar.scrollLeft
    bar.scrollLeft = before - velocity * dt
    velocity *= Math.pow(0.95, dt / 16)
    if (Math.abs(velocity) < 0.02 || bar.scrollLeft === before) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(glide)
  }
  const onTouchStart = (event: TouchEvent) => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    velocity = 0
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
    lastX = startX
    lastT = performance.now()
    axis = "?"
  }
  const onTouchMove = (event: TouchEvent) => {
    const x = event.touches[0].clientX
    const y = event.touches[0].clientY
    if (axis === "?") axis = Math.abs(x - startX) > Math.abs(y - startY) ? "x" : "y"
    if (axis !== "x") return
    bar.scrollLeft -= x - startX
    startX = x
    const now = performance.now()
    const dt = now - lastT
    if (dt > 0) velocity = (x - lastX) / dt
    lastX = x
    lastT = now
    event.preventDefault()
  }
  const onTouchEnd = () => {
    if (axis === "x" && Math.abs(velocity) > 0.02) {
      lastT = performance.now()
      raf = requestAnimationFrame(glide)
    }
  }
  for (const body of bodies) {
    body.addEventListener("wheel", onWheel, { passive: false })
    body.addEventListener("touchstart", onTouchStart, { passive: true })
    body.addEventListener("touchmove", onTouchMove, { passive: false })
    body.addEventListener("touchend", onTouchEnd, { passive: true })
  }

  cleanups.push(() => {
    if (raf) cancelAnimationFrame(raf)
    bar.removeEventListener("scroll", apply)
    bar.remove()
    for (const body of bodies) {
      body.removeEventListener("wheel", onWheel)
      body.removeEventListener("touchstart", onTouchStart)
      body.removeEventListener("touchmove", onTouchMove)
      body.removeEventListener("touchend", onTouchEnd)
      body.style.overflowX = ""
    }
    tables.forEach((table, i) => {
      table.style.width = ""
      table.style.tableLayout = ""
      table.style.transform = ""
      table.style.willChange = ""
      table.querySelector("colgroup[data-sync-cols]")?.remove()
      cells[i].forEach((cell) => (cell.style.whiteSpace = ""))
    })
  })
}
