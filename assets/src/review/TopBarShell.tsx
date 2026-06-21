import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Home } from "lucide-react";

import { ConnectionPill } from "./ConnectionPill";
import { Button } from "@/components/ui/button";

export function HomeButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="pill"
      size="icon"
      title="Project board"
      aria-label="Project board"
      onClick={() => void navigate({ to: "/" })}
    >
      <Home className="text-muted-foreground" />
    </Button>
  );
}

export function TopBarShell(props: { left?: ReactNode; right: ReactNode }) {
  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <HomeButton />
        {props.left}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <ConnectionPill />
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-2">{props.right}</div>
    </header>
  );
}
