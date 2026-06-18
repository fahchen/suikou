import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import { ErrorBoundary } from "./components/error-overlay"
import { debug } from "./debug"
import { MusubiProvider, socket } from "./musubi"
import { router } from "./router"
import "./stores/ui-store"
import "./index.css"

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element #root not found")
}

const tree = (
  <MusubiProvider socket={socket}>
    <RouterProvider router={router} />
  </MusubiProvider>
)

// No <StrictMode>: Musubi's SocketProvider shares one connection per socket
// topic without refcounting, so StrictMode's double-invoked mount effect lets
// the first run's deferred cleanup disconnect the connection the second run
// adopted, cancelling the in-flight root mount with "Disconnected".
createRoot(rootElement).render(debug ? <ErrorBoundary>{tree}</ErrorBoundary> : tree)
