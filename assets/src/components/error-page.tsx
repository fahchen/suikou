import { Link } from "@tanstack/react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { buttonVariants } from "./ui/button";

type ErrorCopy = { label: string; title: string; body: string; detail: string | null };

// Server replies surface bare error atoms (e.g. "review_not_found"). Map the
// ones a reviewer can actually hit to plain copy; anything else falls through
// to a generic message with the raw atom shown in a detail chip.
const KNOWN: Record<string, Omit<ErrorCopy, "detail">> = {
  review_not_found: {
    label: "Not found",
    title: "This review doesn't exist",
    body: "It may have been deleted, or the link points somewhere that never existed.",
  },
};

export function errorCopy(message: string): ErrorCopy {
  const known = KNOWN[message];
  if (known) return { ...known, detail: null };
  return {
    label: "Something went wrong",
    title: "We couldn't load this page",
    body: "It failed to load. Head back to the board and try again.",
    detail: message,
  };
}

/** House-style full-page error. Pass `errorCopy(atom)` or your own copy. */
export function ErrorPage(props: {
  label: string;
  title: string;
  body: string;
  detail?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 text-ink">
      <div className="flex w-full min-w-0 max-w-md animate-in flex-col items-center gap-5 text-center fade-in slide-in-from-bottom-2 duration-500">
        <span className="grid size-14 place-items-center rounded-full bg-soft text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]">
          <TriangleAlert className="size-6" strokeWidth={1.75} aria-hidden />
        </span>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-[0.22em] text-faint uppercase">{props.label}</p>
          <h1 className="text-lg font-semibold text-heading">{props.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{props.body}</p>
        </div>

        {props.detail && (
          <code className="max-w-full truncate rounded-lg bg-code px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {props.detail}
          </code>
        )}

        {props.action ?? (
          <Link to="/" className={buttonVariants({ variant: "pill", size: "sm" })}>
            <ArrowLeft aria-hidden />
            Back to board
          </Link>
        )}
      </div>
    </div>
  );
}
