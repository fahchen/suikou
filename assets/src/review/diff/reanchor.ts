import { parseDiffPatch } from "./parse"

export type DiffSide = "old" | "new"
export type DiffSideRow = { line: number; text: string }

/** One side of a unified patch as the rows that side shows, in order: context
 * lines plus that side's own changes (deletions for `old`, additions for
 * `new`), each with its line number on that side. Mirrors the server's
 * `Suikou.Critique.Anchor` row walk, so a quote captured there locates here. */
export function diffSideRows(patch: string, side: DiffSide): DiffSideRow[] {
  const rows: DiffSideRow[] = []
  for (const file of parseDiffPatch(patch)) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "ctx") rows.push({ line: side === "old" ? line.oldLine : line.newLine, text: line.content })
        else if (line.kind === "del" && side === "old") rows.push({ line: line.oldLine, text: line.content })
        else if (line.kind === "add" && side === "new") rows.push({ line: line.newLine, text: line.content })
      }
    }
  }
  return rows
}

/** Re-anchors a diff comment against the diff on screen (BDR-0024, BDR-0010):
 * finds its captured `quote` as consecutive rows of `rows` (one side of the
 * rendered patch) and returns the lines it now spans. With several matches,
 * the one starting nearest the stored `hintStart` wins. `null` when the quote
 * is not in this diff, and the comment is stranded. Exact match only, as on
 * the server: a diff hunk has no fuzzy relocation. Derived, never written. */
export function locateDiffQuote(
  rows: DiffSideRow[],
  quote: string,
  hintStart: number,
): { start: number; end: number } | null {
  const want = quote.split("\n")
  const span = want.length
  let best: number | null = null
  for (let i = 0; i + span <= rows.length; i++) {
    let match = true
    for (let k = 0; k < span; k++) {
      if (rows[i + k].text !== want[k]) {
        match = false
        break
      }
    }
    if (!match) continue
    if (best === null || Math.abs(rows[i].line - hintStart) < Math.abs(rows[best].line - hintStart)) best = i
  }
  if (best === null) return null
  return { start: rows[best].line, end: rows[best + span - 1].line }
}
