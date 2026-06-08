import { createRootRoute, Outlet } from "@tanstack/react-router"

import { useMusubiConnectionStatus } from "../musubi"

export const Route = createRootRoute({
  component: RootLayout
})

/** Holds every route behind a single socket-connection gate. */
function RootLayout() {
  const connection = useMusubiConnectionStatus()

  if (connection.state === "connecting") return <Centered>Connecting…</Centered>
  if (connection.state === "error") {
    return <Centered tone="error">{connection.error.message}</Centered>
  }

  return <Outlet />
}

function Centered(props: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm" data-tone={props.tone}>
      <span className={props.tone === "error" ? "text-red" : "text-muted-foreground"}>
        {props.children}
      </span>
    </div>
  )
}
