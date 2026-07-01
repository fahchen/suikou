import { useEffect, useRef } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";

import { useMusubiConnectionStatus } from "../musubi";
import { ErrorPage } from "../components/error-page";
import { SettingsModal } from "../settings/SettingsModal";
import { uiStore } from "../stores/ui-store";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * ⌘,` / Ctrl+, opens Settings from anywhere. Ignore when the user is typing in
 * an input/textarea/contentEditable so the shortcut never eats a keystroke.
 */
function useSettingsShortcut() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== ",") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      event.preventDefault();
      uiStore.setSettingsOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const SettingsHost = observer(function SettingsHost() {
  return (
    <SettingsModal
      open={uiStore.settingsOpen}
      onOpenChange={(open) => uiStore.setSettingsOpen(open)}
    />
  );
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

  useSettingsShortcut();

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

  return (
    <>
      <Outlet />
      <SettingsHost />
    </>
  );
}
