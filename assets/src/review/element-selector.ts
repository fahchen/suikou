/**
 * Element-anchor helpers for the HTML artifact view.
 *
 * Element anchors are CLIENT-only — the server stores `{ selector, quote }`
 * verbatim and never relocates, so this module owns selector derivation,
 * resolution, and the outdated check. We deliberately avoid an XPath-style
 * absolute path: a stable id wins outright, and otherwise we walk up tagging
 * each step with `:nth-of-type(n)` until we hit a stable ancestor (an id or
 * the document root).
 */

const STOP_AT_ROOT_TAGS = new Set(["BODY", "HTML"])

/** Derive a reasonably stable CSS selector for `el` inside its owning document. */
export function selectorFor(el: Element): string {
  if (el.id !== "") return `#${cssEscape(el.id)}`

  const parts: string[] = []
  let cur: Element | null = el
  while (cur && !STOP_AT_ROOT_TAGS.has(cur.tagName)) {
    if (cur.id !== "") {
      parts.unshift(`#${cssEscape(cur.id)}`)
      return parts.join(" > ")
    }
    parts.unshift(stepFor(cur))
    cur = cur.parentElement
  }
  if (cur && STOP_AT_ROOT_TAGS.has(cur.tagName)) parts.unshift(cur.tagName.toLowerCase())
  return parts.join(" > ")
}

/** Resolve a previously-derived selector against a live DOM root. */
export function locate(root: Document | Element, selector: string): Element | null {
  if (selector === "") return null
  try {
    return root.querySelector(selector)
  } catch {
    return null
  }
}

/** True when the selector misses or the located element no longer contains the quote. */
export function isOutdated(
  root: Document | Element,
  anchor: { selector: string; quote: string }
): boolean {
  const el = locate(root, anchor.selector)
  if (!el) return true
  if (anchor.quote === "") return false
  return !(el.textContent ?? "").includes(anchor.quote)
}

function stepFor(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement
  if (!parent) return tag
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName)
  if (siblings.length === 1) return tag
  const idx = siblings.indexOf(el) + 1
  return `${tag}:nth-of-type(${idx})`
}

function cssEscape(value: string): string {
  // CSS.escape is in jsdom + every browser we ship to; fall back to a minimal
  // escape for environments without it (older jsdom, node REPL).
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value)
  return value.replace(/([^\w-])/g, "\\$1")
}
