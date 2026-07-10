export type FrontmatterEntry = { key: string; value: string }

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Detect a leading YAML frontmatter fence (`--- … ---` at the very top).
 * Returns the parsed top-level key/value entries, plus `blanked`: the source
 * with the fence lines replaced by blank lines so the newline count is preserved
 * and downstream block line-maps stay aligned with the raw file. `endLine` is the
 * last source line the fence occupies. `null` when there is no frontmatter.
 */
export function parseFrontmatter(
  source: string,
): { entries: FrontmatterEntry[]; blanked: string; endLine: number } | null {
  const match = FENCE.exec(source)
  if (!match || match.index !== 0) return null
  const raw = match[0]
  const endLine = (raw.endsWith("\n") ? raw.slice(0, -1) : raw).split("\n").length
  const entries = parseYaml(match[1])
  if (entries.length === 0) return null
  return { entries, blanked: "\n".repeat(endLine) + source.slice(raw.length), endLine }
}

// ponytail: a deliberately tiny YAML reader — top-level `key: value` pairs, with
// indented / list lines folded into the previous value as comma-joined text.
// Nested maps and block scalars collapse to that flat text; swap in a real YAML
// parser here if typed values are ever needed.
function parseYaml(text: string): FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = []
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const top = /^([A-Za-z0-9_][\w.-]*):[ \t]*(.*)$/.exec(line)
    if (top && !/^\s/.test(line)) {
      entries.push({ key: top[1], value: unquote(top[2].trim()) })
      continue
    }
    const last = entries[entries.length - 1]
    if (!last) continue
    const piece = unquote(line.trim().replace(/^-\s*/, ""))
    if (piece) last.value = last.value ? `${last.value}, ${piece}` : piece
  }
  return entries
}

const unquote = (value: string): string => value.replace(/^["']|["']$/g, "")

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;",
  )

/** Render frontmatter entries into the metadata card shown atop the preview. */
export function renderFrontmatterCard(entries: FrontmatterEntry[]): string {
  const rows = entries
    .map(
      (entry) =>
        `<div class="md-fm-row"><dt class="md-fm-key">${escapeHtml(entry.key)}</dt>` +
        `<dd class="md-fm-val">${entry.value ? escapeHtml(entry.value) : '<span class="md-fm-empty">—</span>'}</dd></div>`,
    )
    .join("")
  return `<div class="md-frontmatter"><div class="md-fm-label">Frontmatter</div><dl class="md-fm-list">${rows}</dl></div>`
}
