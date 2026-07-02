import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  GitBranch,
  GitCompare,
  Home,
} from "lucide-react";

import { ConnectionPill } from "./ConnectionPill";
import { type ReviewKind } from "./KindBadge";
import {
  formatMovedTitle,
  formatRefsRange,
  refsMoved,
  vanishedSide,
  type DiffRefs,
} from "./diff-refs";
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

/** Shared breadcrumb chip: `suikou › [kind-icon] review-name ▾`. Used in the
 * live workspace top bar and any file-level fallback screen so the review's
 * identity reads the same wherever the chrome renders. For a git_diff review
 * the compared refs and any refs-moved / branch-deleted state append inline. */
export function ReviewBreadcrumb(props: {
  kind: ReviewKind;
  name: string;
  refs?: DiffRefs | null;
}) {
  const KindIcon = props.kind === "git_diff" ? GitCompare : FileText;
  return (
    <div className="flex min-w-0 items-center gap-[9px]">
      <button
        type="button"
        className="flex h-[30px] min-w-0 items-center gap-[6px] rounded-lg px-2 text-[13px] hover:bg-hover"
        title="Switch review"
      >
        <span className="font-medium tracking-[-0.01em] text-muted-foreground">suikou</span>
        <span className="text-faint" aria-hidden>
          ›
        </span>
        <KindIcon
          size={13}
          aria-hidden
          className="shrink-0 text-muted-foreground"
        />
        <span
          className="min-w-0 truncate font-semibold tracking-[-0.015em] text-heading"
          title={props.name}
        >
          {props.name}
        </span>
        <ChevronDown
          size={12}
          aria-hidden
          className="-mr-0.5 shrink-0 text-muted-foreground opacity-70"
        />
      </button>
      {props.refs && <DiffRefsChip refs={props.refs} />}
    </div>
  );
}

/** Mono `base@sha..head@sha` chip + optional refs-state pill. Hidden below
 * `sm` so a narrow top bar keeps the review name legible; the state pill still
 * shows so the reviewer never misses that the diff is stale or vanished. */
function DiffRefsChip({ refs }: { refs: DiffRefs }) {
  const vanished = vanishedSide(refs) !== null;
  const moved = refsMoved(refs);
  return (
    <>
      <span
        className="hidden min-w-0 max-w-[36ch] truncate font-mono text-[11px] text-muted-foreground sm:inline"
        title={`Comparing ${formatRefsRange(refs)}`}
      >
        {formatRefsRange(refs)}
      </span>
      {moved && !vanished && (
        <RefsPill
          tone="amber"
          icon={<GitBranch size={10} aria-hidden />}
          label="refs moved"
          title={formatMovedTitle(refs)}
        />
      )}
      {vanished && (
        <RefsPill
          tone="red"
          icon={<AlertTriangle size={10} aria-hidden />}
          label="branch deleted"
          title="A ref no longer exists; the diff is frozen at its last known state"
        />
      )}
    </>
  );
}

const REFS_PILL_TONE = {
  amber: "bg-amber-soft text-amber ring-1 ring-inset ring-amber/30",
  red: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
} as const;

function RefsPill(props: {
  tone: keyof typeof REFS_PILL_TONE;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] ${REFS_PILL_TONE[props.tone]}`}
      title={props.title}
    >
      {props.icon}
      {props.label}
    </span>
  );
}


/** Vertical hairline separator between toolbar clusters (`.tb-sep` in mockup). */
export function TopBarSep() {
  return <span aria-hidden className="mx-[3px] h-[22px] w-px bg-line-strong" />;
}

export function TopBarShell(props: {
  crumb?: ReactNode;
  left?: ReactNode;
  right: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[50px] items-center gap-[9px] border-b border-line-strong bg-panel px-3 shadow-[inset_0_1px_0_var(--line-soft)] sm:px-4">
      <div className="flex min-w-0 items-center gap-[6px]">
        <HomeButton />
        {props.crumb}
        {props.left}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <ConnectionPill />
      </div>
      <div className="ml-auto flex items-center gap-[6px]">{props.right}</div>
    </header>
  );
}
