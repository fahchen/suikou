import { createRootRoute, Outlet } from "@tanstack/react-router";

import { useMusubiConnectionStatus } from "../musubi";
import { Centered } from "../components/centered";
import { ErrorPage } from "../components/error-page";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
});

/** Holds every route behind a single socket-connection gate. */
function RootLayout() {
  const connection = useMusubiConnectionStatus();

  if (connection.state === "connecting") return <Centered>Connecting…</Centered>;
  if (connection.state === "error") {
    return (
      <ErrorPage
        label="Disconnected"
        title="Can't reach Suikou"
        body="The connection dropped. Make sure Suikou is still running, then reload."
        detail={connection.error.message}
        action={
          <Button variant="pill" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    );
  }

  return <Outlet />;
}
