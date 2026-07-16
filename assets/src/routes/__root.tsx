import { useRef } from "react"
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { motion } from "motion/react"

import { Toaster } from "../components/ui/sonner"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  // Key the transition on the top-level route (board vs. a review), not the full
  // path — switching files inside a review keeps its own in-page animations and
  // shouldn't replay the whole-page slide.
  const segment = useRouterState({ select: (s) => s.location.pathname.split("/")[1] ?? "" })

  // Zoom depth follows navigation: entering a review grows in from slightly
  // smaller (0.96), going back to the board eases down from slightly larger
  // (1.04) — the scale change alone implies the hierarchy, no sliding.
  const prev = useRef(segment)
  const forward = segment !== "" && prev.current === ""
  prev.current = segment
  const enterScale = forward ? 0.96 : 1.04

  return (
    <div className="h-dvh overflow-hidden bg-canvas">
      {/* No exit animation / no mode="wait": the router swaps routes instantly,
          then the incoming page zooms + fades in. Opacity starts at 0.5 (not 0)
          so the fade never lands on a fully blank canvas. */}
      <motion.div
        key={segment}
        className="h-dvh"
        initial={{ opacity: 0.5, scale: enterScale }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          // Spring the scale so it settles softly; opacity rides a plain tween.
          scale: { type: "spring", stiffness: 170, damping: 24, mass: 1 },
          opacity: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
        }}
      >
        <Outlet />
      </motion.div>
      <Toaster position="bottom-right" />
    </div>
  )
}
