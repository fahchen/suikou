import type { RawSourceMap, SourceMapConsumer as Consumer } from "source-map-js"

// V8/Chrome: "    at fn (url:line:col)" or "    at url:line:col"
const V8_RE = /^(\s*)at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
// JSC/SpiderMonkey (Safari, Firefox): "fn@url:line:col" or "@url:line:col"
const JSC_RE = /^(\s*)(?:(.*?)@)?(\S+?):(\d+):(\d+)\s*$/
const DEP_RE = /node_modules|\/deps\//

type Frame = { indent: string; name?: string; url: string; line: number; col: number }

function parseFrame(line: string): Frame | null {
  const m = V8_RE.exec(line) ?? JSC_RE.exec(line)
  if (!m) return null
  const [, indent, name, url, lineStr, colStr] = m
  return { indent, name, url, line: Number(lineStr), col: Number(colStr) }
}

const rawMapCache = new Map<string, RawSourceMap | null>()

/**
 * Best-effort remap of a captured `error.stack` to original source positions by
 * fetching each frame's source map at runtime. `source-map-js` is dynamically
 * imported so it only loads when an error is actually shown. Frames that can't
 * be mapped are kept verbatim. With `includeDeps: false`, frames resolving into
 * node_modules / vendored deps are dropped so only app code remains.
 */
export async function remapStack(
  stack: string,
  opts: { includeDeps: boolean },
): Promise<string> {
  const { SourceMapConsumer } = await import("source-map-js")
  const consumers = new Map<string, Consumer | null>()
  const out: string[] = []

  for (const line of stack.split("\n")) {
    const frame = parseFrame(line)
    if (!frame) {
      out.push(line)
      continue
    }
    const { indent, url } = frame
    let source = url
    let srcLine = frame.line
    let srcCol = frame.col
    let name = frame.name

    let consumer = consumers.get(url)
    if (consumer === undefined) {
      consumer = await loadConsumer(url, SourceMapConsumer)
      consumers.set(url, consumer)
    }
    if (consumer) {
      const pos = consumer.originalPositionFor({ line: frame.line, column: frame.col })
      if (pos.source) {
        source = pos.source
        srcLine = pos.line ?? srcLine
        srcCol = pos.column ?? srcCol
        name = pos.name ?? frame.name
      }
    }

    // Classify deps from the bundled url (dev: /node_modules/.vite/deps/…) or
    // the remapped source (prod: deps inlined under node_modules/…).
    if ((DEP_RE.test(url) || DEP_RE.test(source)) && !opts.includeDeps) continue
    out.push(`${indent}at ${name ? `${name} ` : ""}(${source}:${srcLine}:${srcCol})`)
  }

  return out.join("\n")
}

async function loadConsumer(
  url: string,
  SourceMapConsumer: typeof import("source-map-js").SourceMapConsumer,
): Promise<Consumer | null> {
  let raw = rawMapCache.get(url)
  if (raw === undefined) {
    raw = await fetchRawMap(url)
    rawMapCache.set(url, raw)
  }
  return raw ? new SourceMapConsumer(raw) : null
}

async function fetchRawMap(url: string): Promise<RawSourceMap | null> {
  try {
    const text = await (await fetch(url)).text()
    const ref = /\/\/[#@]\s*sourceMappingURL=(.+)\s*$/m.exec(text)?.[1]?.trim()
    if (!ref) return null
    if (ref.startsWith("data:")) {
      const payload = ref.slice(ref.indexOf(",") + 1)
      return JSON.parse(ref.includes(";base64,") ? atob(payload) : decodeURIComponent(payload))
    }
    return await (await fetch(new URL(ref, url).href)).json()
  } catch {
    return null
  }
}
