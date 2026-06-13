/**
 * Pure unified-diff parser used by the two-column diff view. Splits a unified
 * diff into hunks and pairs each hunk's removals with the adjacent additions so
 * the two-column renderer can show modified lines side-by-side. Per-side line
 * numbers track the backend's `diff_side_rows` semantics (BDR-0020), so a
 * reviewer's selection on either side translates 1:1 into a `diff_hunk` anchor.
 */

export type DiffSide = "old" | "new"

/** Pairing kind of a row, used only for cell styling. */
export type RowKind = "context" | "add" | "remove" | "replace"

export interface DiffCell {
  /** 1-based line number on this side of the diff. */
  lineNo: number
  /** Prefix-stripped line text. */
  text: string
}

export interface DiffRow {
  old: DiffCell | null
  new: DiffCell | null
  kind: RowKind
}

export interface DiffHunk {
  /** Verbatim `@@ -a,b +c,d @@ ...` header line. */
  header: string
  oldStart: number
  newStart: number
  rows: DiffRow[]
}

export interface ParsedDiff {
  hunks: DiffHunk[]
}

interface HunkCounts {
  oldStart: number
  newStart: number
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function parseHunkHeader(line: string): HunkCounts | null {
  const match = HUNK_RE.exec(line)
  if (!match) return null
  return { oldStart: Number(match[1]), newStart: Number(match[2]) }
}

interface PendingRuns {
  minus: DiffCell[]
  plus: DiffCell[]
}

function flushRuns(rows: DiffRow[], runs: PendingRuns): void {
  const paired = Math.min(runs.minus.length, runs.plus.length)
  for (let i = 0; i < paired; i++) {
    rows.push({ old: runs.minus[i], new: runs.plus[i], kind: "replace" })
  }
  for (let i = paired; i < runs.minus.length; i++) {
    rows.push({ old: runs.minus[i], new: null, kind: "remove" })
  }
  for (let i = paired; i < runs.plus.length; i++) {
    rows.push({ old: null, new: runs.plus[i], kind: "add" })
  }
  runs.minus = []
  runs.plus = []
}

/**
 * Walks a unified diff string into hunks of paired old/new rows. Anything
 * before the first `@@` header (the `diff --git` / `---` / `+++` block) is
 * dropped — only hunk bodies anchor comments. Unknown body lines (e.g. the
 * `\ No newline at end of file` marker) are skipped without advancing line
 * numbers, matching the backend resolver.
 */
export function parseUnifiedDiff(text: string): ParsedDiff {
  const hunks: DiffHunk[] = []
  if (text === "") return { hunks }

  const lines = text.split("\n")
  let current: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  const runs: PendingRuns = { minus: [], plus: [] }

  for (const raw of lines) {
    const header = parseHunkHeader(raw)
    if (header) {
      if (current) flushRuns(current.rows, runs)
      current = { header: raw, oldStart: header.oldStart, newStart: header.newStart, rows: [] }
      hunks.push(current)
      oldNo = header.oldStart
      newNo = header.newStart
      continue
    }
    if (!current) continue

    const first = raw.charAt(0)
    const body = raw.slice(1)
    if (first === " ") {
      flushRuns(current.rows, runs)
      current.rows.push({
        old: { lineNo: oldNo, text: body },
        new: { lineNo: newNo, text: body },
        kind: "context"
      })
      oldNo++
      newNo++
    } else if (first === "-") {
      runs.minus.push({ lineNo: oldNo, text: body })
      oldNo++
    } else if (first === "+") {
      runs.plus.push({ lineNo: newNo, text: body })
      newNo++
    }
  }

  if (current) flushRuns(current.rows, runs)
  return { hunks }
}

/**
 * Joins the prefix-stripped texts on `side` for line numbers `start..end`,
 * inclusive. Mirrors `quote_diff_side/4` so the client-captured quote matches
 * what the server stores. Returns `""` when the range is empty or no rows on
 * `side` fall inside it.
 */
export function quoteDiffSide(
  parsed: ParsedDiff,
  side: DiffSide,
  start: number,
  end: number
): string {
  const picked: string[] = []
  for (const hunk of parsed.hunks) {
    for (const row of hunk.rows) {
      const cell = row[side]
      if (cell && cell.lineNo >= start && cell.lineNo <= end) {
        picked.push(cell.text)
      }
    }
  }
  return picked.join("\n")
}
