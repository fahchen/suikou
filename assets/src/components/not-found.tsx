import { Link } from "@tanstack/react-router";
import { ArrowLeft, Compass } from "lucide-react";

import { buttonVariants } from "./ui/button";

/**
 * Full-screen fallback for any route the router can't resolve. Echoes the
 * unmatched path so a reviewer who followed a stale or mistyped link can see
 * exactly what failed, and offers the one way back that always exists.
 */
export function NotFound() {
  const path = typeof window === "undefined" ? "" : window.location.pathname;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 text-ink">
      <div className="flex w-full min-w-0 max-w-sm animate-in flex-col items-center gap-5 text-center fade-in slide-in-from-bottom-2 duration-500">
        <span className="grid size-14 place-items-center rounded-full bg-soft text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]">
          <Compass className="size-6" strokeWidth={1.75} aria-hidden />
        </span>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-[0.22em] text-faint uppercase">Error 404</p>
          <h1 className="text-lg font-semibold text-heading">We can&rsquo;t find that page</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link may be broken, or the review was moved or deleted.
          </p>
        </div>

        {path && path !== "/" && (
          <code className="max-w-full truncate rounded-lg bg-code px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {path}
          </code>
        )}

        <Link to="/" className={buttonVariants({ variant: "pill", size: "sm" })}>
          <ArrowLeft aria-hidden />
          Back to board
        </Link>
      </div>
    </div>
  );
}
