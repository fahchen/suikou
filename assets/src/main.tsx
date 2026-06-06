import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import { MusubiProvider, socket } from "./musubi"
import { router } from "./router"
import "./index.css"

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element #root not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <MusubiProvider socket={socket}>
      <RouterProvider router={router} />
    </MusubiProvider>
  </StrictMode>
)
