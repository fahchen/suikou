import { useRef } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import { useMusubiConnectionStatus } from "../musubi";
import { ErrorPage } from "../components/error-page";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * Gates the app on the *initial* socket connection only. Routes mount their
 * stores through `useMusubiConnection`, which needs a ready connection, so the
 * very first connect must resolve before any route renders. Once connected,
 * never blank the app again on a later connecting/error flash — the in-page
 * ConnectionPill signals reconnects and the stores keep their last-good
 * snapshot, so replacing the whole tree (losing scroll, drafts, open menus)
 * would be worse than a brief stale frame.
 */
function RootLayout() {
  const connection = useMusubiConnectionStatus();
  const everReady = useRef(false);
  if (connection.state === "ready") everReady.current = true;

  if (!everReady.current) {
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

    // Initial connect only. Paint on the app canvas (not the bare white body) so
    // the first frame doesn't flash white before the socket is ready.
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-sm text-muted-foreground">
        Connecting…
      </div>
    );
  }

  return <Outlet />;
}
