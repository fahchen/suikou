/** Copy `text`, resolving to whether it landed.
 *
 * `navigator.clipboard` only exists in a secure context (https/localhost). Over
 * plain http (e.g. a Tailscale IP on a phone) it is undefined, so fall back to a
 * hidden textarea + execCommand copy.
 *
 * ## Examples
 *
 *     await writeClipboard("some/path.ts")
 *     //=> true
 */
export async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand("copy")
  document.body.removeChild(area)
  return ok
}
