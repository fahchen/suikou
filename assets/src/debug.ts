// Debug gate, resolved once at module load. main.tsx wraps the ErrorBoundary and
// router.tsx sets the error overlay synchronously, so this must be known before
// any async work. On in dev (Vite); in prod, on when config.toml sets `debug` and
// SpaController injects the meta tag into the served shell.
const metaDebug =
  document.querySelector('meta[name="suikou:debug"]')?.getAttribute("content") === "true"

export const debug = import.meta.env.DEV || metaDebug
