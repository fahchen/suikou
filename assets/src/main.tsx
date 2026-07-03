import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import { router } from "./router"
import "./index.css"

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element #root not found")
}

createRoot(rootElement).render(<RouterProvider router={router} />)
