// Last line of defence for the PWA update path.
//
// The service worker precaches the app shell so a backgrounded tab repaints from
// cache instead of the network. That shell names hashed chunks, and a new build
// deletes the old ones from the server, so a tab holding an older shell can ask
// for a chunk that is no longer there. `registerSW({ immediate: true })` and
// `clientsClaim` normally swap the shell out first, but neither covers the window
// where the page has already loaded and only reaches for a lazy route chunk
// afterwards. One reload lands on the fresh shell.

const LAST_RELOAD_KEY = "suikou:shell-reload-at"

// A stale shell recurs across deploys, minutes or hours apart. A build that is
// genuinely missing a chunk fails again the instant the reload finishes, so
// rate-limiting the reload is what separates the two — a flag cleared on load
// would let the broken case spin forever.
const RELOAD_COOLDOWN_MS = 60_000

// Chromium, Firefox and WebKit each word this differently; match the shape they
// agree on rather than any one browser's exact sentence.
const CHUNK_LOAD_FAILURE =
  /(dynamically imported module|importing a module script failed|error loading chunk)/i

/** Whether `error` is a lazy chunk this tab's shell expects but the server no
 * longer has — the signature of a shell left behind by a newer build. */
export function staleShellError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return CHUNK_LOAD_FAILURE.test(message)
}

/** Reloads onto the current shell, at most once per cooldown. Returns whether a
 * reload was started, so a caller can render a placeholder rather than an error
 * the user is about to navigate away from. */
export function reloadForFreshShell(): boolean {
  const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0)
  if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false

  sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

/** Catches chunk failures outside the router — the highlight worker and its
 * grammars, the outline parser — which would otherwise break a feature quietly
 * rather than surfacing on the error page. */
export function recoverFromStaleShell(): void {
  window.addEventListener("unhandledrejection", (event) => {
    if (staleShellError(event.reason)) reloadForFreshShell()
  })
}
