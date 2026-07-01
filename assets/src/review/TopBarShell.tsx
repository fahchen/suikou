import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Home } from "lucide-react";

import { ConnectionPill } from "./ConnectionPill";
import { KindBadge, type ReviewKind } from "./KindBadge";
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

/** Shared breadcrumb chip: `/` separator + KindBadge + review name. Used in the
 * live workspace top bar and any file-level fallback screen so the review's
 * identity reads the same wherever the chrome renders. */
export function ReviewBreadcrumb(props: { kind: ReviewKind; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-faint" aria-hidden>
        /
      </span>
      <KindBadge kind={props.kind} />
      <span
        className="min-w-0 truncate text-[13px] font-medium text-heading"
        title={props.name}
      >
        {props.name}
      </span>
    </div>
  );
}

export function TopBarShell(props: {
  crumb?: ReactNode;
  left?: ReactNode;
  right: ReactNode;
}) {
  return (
    <header className="pointer-events-none sticky top-0 z-20 mx-auto flex w-full max-w-[1760px] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-10">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <HomeButton />
        {props.crumb}
        {props.left}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <ConnectionPill />
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-2">{props.right}</div>
    </header>
  );
}
