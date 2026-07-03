import { observer } from "mobx-react-lite";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

import { useReviewStructure } from "./use-review-structure";
import { reviewFileTarget } from "./review-navigation";
import { VerdictIcon } from "./TopBarVerdictMenu";
import { VERDICT_META, type FileSnapshot, type ReviewSnapshot, type Verdict } from "./types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const VERDICT_TONE: Record<Verdict, { bg: string; edge: string; text: string }> = {
  request_changes: { bg: "bg-red-soft", edge: "ring-red/40", text: "text-red" },
  approve: { bg: "bg-green-soft", edge: "ring-green/40", text: "text-green" },
  comment: { bg: "bg-blue-soft", edge: "ring-blue/40", text: "text-blue" },
};

function anchorLine(anchor: unknown): number | null {
  if (!anchor || typeof anchor !== "object") return null;
  const a = anchor as { start_line?: number };
  return typeof a.start_line === "number" ? a.start_line : null;
}

function derivedVerdict(files: FileSnapshot[]): Verdict | null {
  const drafts = files
    .map((f) => f.draft_verdict as Verdict | null)
    .filter((v): v is Verdict => v !== null);
  if (drafts.length === 0) return null;
  if (drafts.includes("request_changes")) return "request_changes";
  if (drafts.includes("comment")) return "comment";
  return "approve";
}

/**
 * H2 review overview popover. The Review button in the top bar sits next to
 * Submit and drops down a summary card: draft verdict banner, open blockers
 * (file + line, jumps to the anchor), and this round's file/unresolved/reviewed
 * counts. Same data SubmitControls and the Navigator meter already show, laid
 * out per the H2 storyboard.
 */
export const TopBarReviewSummary = observer(function TopBarReviewSummary(props: {
  reviewSnapshot: ReviewSnapshot;
  sourceView: boolean;
}) {
  const { reviewSnapshot, sourceView } = props;
  const structure = useReviewStructure();
  const navigate = useNavigate();

  const files = (reviewSnapshot.body.files ?? []) as unknown as FileSnapshot[];
  const verdict = derivedVerdict(files);

  const blockers: { path: string; line: number | null }[] = [];
  let unresolved = 0;
  let reviewed = 0;
  for (const f of files) {
    if (f.draft_verdict || f.latest_verdict) reviewed += 1;
    for (const c of f.comments?.items ?? []) {
      const open = c.status === "pending" || !c.resolved;
      if (open) unresolved += 1;
      if (open && c.critique_type === "fix_required" && c.status === "published") {
        blockers.push({ path: f.path, line: anchorLine(c.anchor) });
      }
    }
  }

  const total = files.length;
  const round = reviewSnapshot.body.latest_round ?? 0;
  const tone = verdict ? VERDICT_TONE[verdict] : null;
  const verdictLabel = verdict ? `${VERDICT_META[verdict].label} (draft)` : "None yet";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="sm"
            title="Review summary"
            aria-label="Review summary"
            className="h-[30px] gap-[6px] px-[9px]"
          />
        }
      >
        <ClipboardCheck size={14} className="text-muted-foreground" />
        <span className="text-[12.5px] font-[600]">Review</span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[300px] gap-3 p-3">
        <div className="text-[10px] font-[720] uppercase tracking-[0.12em] text-faint">
          Review summary
        </div>

        <div
          className={`flex items-center gap-[9px] rounded-[9px] px-[10px] py-[8px] ring-1 ring-inset ${
            tone ? `${tone.bg} ${tone.edge}` : "bg-canvas ring-line"
          }`}
        >
          <span className="shrink-0">
            <VerdictIcon verdict={verdict} size={16} />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-[640] uppercase tracking-[0.08em] text-muted-foreground">
              Draft verdict
            </span>
            <span
              className={`truncate text-[13px] font-[640] ${tone ? tone.text : "text-heading"}`}
            >
              {verdictLabel}
            </span>
          </span>
        </div>

        {blockers.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[10px] font-[720] uppercase tracking-[0.12em] text-faint">
              Open blockers
            </div>
            <ul className="flex flex-col gap-[3px]">
              {blockers.map((b, i) => (
                <li key={`${b.path}:${b.line ?? i}`}>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate(reviewFileTarget(structure.review_id, b.path, sourceView))
                    }
                    className="flex w-full items-center gap-[8px] rounded-[7px] px-[8px] py-[5px] text-left hover:bg-hover"
                  >
                    <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-red" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-[560] text-heading">
                      {b.path}
                    </span>
                    {b.line !== null && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        line {b.line}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-[6px]">
          <div className="text-[10px] font-[720] uppercase tracking-[0.12em] text-faint">
            This round
            <span className="ml-2 text-faint/80">· R{round}</span>
          </div>
          <div className="grid grid-cols-3 gap-[6px]">
            <Stat n={total} k="files" />
            <Stat n={unresolved} k="unresolved" tone={unresolved > 0 ? "warn" : undefined} />
            <Stat n={reviewed} k="reviewed" tone={reviewed > 0 ? "ok" : undefined} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

function Stat(props: { n: number; k: string; tone?: "warn" | "ok" }) {
  const toneCls =
    props.tone === "warn" ? "text-red" : props.tone === "ok" ? "text-green" : "text-heading";
  return (
    <div className="flex flex-col items-center justify-center rounded-[9px] bg-canvas/70 px-[6px] py-[7px] ring-1 ring-inset ring-line">
      <span className={`text-[18px] font-[680] tabular-nums leading-none ${toneCls}`}>
        {props.n}
      </span>
      <span className="mt-[3px] text-[10px] font-[620] uppercase tracking-[0.08em] text-muted-foreground">
        {props.k}
      </span>
    </div>
  );
}
