/** Diff patch parser.
 *
 * Consumes a git-style unified patch (multi-file or single-file) and yields a
 * side-neutral `DiffFile[]` model. The parser is intentionally dumb: one
 * forward pass, no error throwing, unknown lines are silently classified as
 * `meta` or skipped. Callers get a stable shape they can render without any
 * further diff-format awareness. */

export type DiffLine =
  | { kind: "add"; newLine: number; content: string }
  | { kind: "del"; oldLine: number; content: string }
  | { kind: "ctx"; oldLine: number; newLine: number; content: string }
  | { kind: "meta"; content: string }

export type DiffHunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** Verbatim `@@ -a,b +c,d @@ …` header. */
  header: string
  lines: DiffLine[]
}

export type DiffFile = {
  /** Path on the pre-image side. `null` when the patch has no `--- a/…` side
   * (e.g. an added file's `--- /dev/null`) or the file is binary with no
   * text hunks. */
  oldPath: string | null
  newPath: string | null
  isBinary: boolean
  hunks: DiffHunk[]
}

/** Parse a git-style unified patch. Handles multi-file diffs (`diff --git`
 * headers between files), single-file patches with no top-level `diff --git`,
 * `\ No newline at end of file` metalines, binary patches, and rename headers.
 * Mode/index/similarity lines are ignored. */
export function parseDiffPatch(patch: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  const startFile = (): DiffFile => {
    const file: DiffFile = { oldPath: null, newPath: null, isBinary: false, hunks: [] }
    files.push(file)
    return file
  }
  const ensureFile = (): DiffFile => {
    if (current === null) current = startFile()
    return current
  }
  const closeHunk = () => {
    hunk = null
  }

  const lines = patch.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""

    // File boundary. Every `diff --git` starts a fresh file.
    if (line.startsWith("diff --git ")) {
      current = startFile()
      closeHunk()
      continue
    }

    // Binary patch marker: no hunks follow for this file.
    if (line.startsWith("Binary files ") && line.endsWith("differ")) {
      const file = ensureFile()
      file.isBinary = true
      closeHunk()
      continue
    }

    // Pre-image path.
    if (line.startsWith("--- ")) {
      const file = ensureFile()
      file.oldPath = extractPath(line.slice(4))
      closeHunk()
      continue
    }

    // Post-image path. `+++ b/…` also carries rename destinations.
    if (line.startsWith("+++ ")) {
      const file = ensureFile()
      file.newPath = extractPath(line.slice(4))
      closeHunk()
      continue
    }

    // Hunk header.
    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line)
      if (parsed === null) {
        closeHunk()
        continue
      }
      const file = ensureFile()
      hunk = {
        oldStart: parsed.oldStart,
        oldCount: parsed.oldCount,
        newStart: parsed.newStart,
        newCount: parsed.newCount,
        header: line,
        lines: [],
      }
      file.hunks.push(hunk)
      oldLine = parsed.oldStart
      newLine = parsed.newStart
      continue
    }

    // Body lines. Only meaningful inside an open hunk.
    if (hunk !== null) {
      if (line.startsWith("+")) {
        hunk.lines.push({ kind: "add", newLine, content: line.slice(1) })
        newLine += 1
        continue
      }
      if (line.startsWith("-")) {
        hunk.lines.push({ kind: "del", oldLine, content: line.slice(1) })
        oldLine += 1
        continue
      }
      if (line.startsWith(" ")) {
        hunk.lines.push({ kind: "ctx", oldLine, newLine, content: line.slice(1) })
        oldLine += 1
        newLine += 1
        continue
      }
      if (line.startsWith("\\")) {
        // "\ No newline at end of file" (and any other `\ …` metaline). Attach
        // to the preceding line-group so the renderer can decorate it.
        hunk.lines.push({ kind: "meta", content: line })
        continue
      }
      // Empty trailing line before the next hunk/file — skip silently. Any
      // other unrecognized in-hunk line is treated as meta so we don't drop it.
      if (line.length === 0) continue
      hunk.lines.push({ kind: "meta", content: line })
      continue
    }

    // Outside a hunk: mode, index, similarity, rename, etc. Ignored.
  }

  return files
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function parseHunkHeader(line: string): {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
} | null {
  const match = HUNK_RE.exec(line)
  if (match === null) return null
  const oldStart = Number(match[1])
  const oldCount = match[2] === undefined ? 1 : Number(match[2])
  const newStart = Number(match[3])
  const newCount = match[4] === undefined ? 1 : Number(match[4])
  return { oldStart, oldCount, newStart, newCount }
}

/** Strip `a/`/`b/` prefixes and a trailing tab-annotation. `/dev/null` collapses
 * to `null` so callers can tell added/deleted files apart from renames. */
function extractPath(raw: string): string | null {
  const trimmed = raw.split("\t")[0]?.trim() ?? ""
  if (trimmed.length === 0 || trimmed === "/dev/null") return null
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) return trimmed.slice(2)
  return trimmed
}
