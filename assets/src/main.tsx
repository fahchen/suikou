import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { registerSW } from "virtual:pwa-register"

import { MusubiProvider, socket } from "./musubi"
import { recoverFromStaleShell } from "./lib/stale-shell"
import { router } from "./router"
import "./stores/ui-store"
import "./index.css"

// How often an open tab asks whether a newer build is out. The browser only
// checks sw.js on navigation, so a review left open beside an agent's work would
// otherwise sit on the build it started with all day.
const UPDATE_CHECK_MS = 15 * 60 * 1000

// `immediate` applies a new worker the moment one is found rather than waiting
// for every tab to close. Registering here rather than letting the plugin emit a
// file keeps it inside the hashed bundle — see vite.config.ts.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Coming back to the tab is the moment an update matters and the moment a
    // reload costs least, so check then as well as on the timer.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update()
    })
    setInterval(() => void registration.update(), UPDATE_CHECK_MS)
  },
})

recoverFromStaleShell()

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element #root not found")
}

createRoot(rootElement).render(
  <MusubiProvider socket={socket}>
    <RouterProvider router={router} />
  </MusubiProvider>,
)
