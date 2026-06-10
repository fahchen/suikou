import { useState } from "react";
import { ChevronDown, Check, PencilLine, MessageSquare } from "lucide-react";

import { useReviewCommands } from "./commands";
import { hasUnresolvedBlocker } from "./store-context";
import { VERDICT_META, type Comment, type ReviewSnapshot, type Verdict } from "./types";
import type { CritiqueType } from "../stores/ui-store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const VERDICTS: Verdict[] = ["comment", "request_changes", "approve"];
const TYPE_OPTIONS: CritiqueType[] = ["fix_required", "needs_answer", "note"];

/** Verdict icon used in the trigger and each option row. */
export function VerdictIcon(props: { verdict: Verdict; size?: number }) {
  if (props.verdict === "approve")
    return <Check size={props.size ?? 15} className="text-green-text" />;
  if (props.verdict === "request_changes")
    return <PencilLine size={props.size ?? 15} className="text-red" />;
  return <MessageSquare size={props.size ?? 15} className="text-muted-foreground" />;
}

/** Verdict selection plus the review-scoped note, persisted as a pending draft. */
export function TopBarVerdictMenu(props: {
  snapshot: ReviewSnapshot;
  verdict: Verdict;
  onVerdictChange: (verdict: Verdict) => void;
}) {
  const { snapshot, verdict, onVerdictChange } = props;
  const commands = useReviewCommands();
  const draft = reviewDraft(snapshot.comments.items);
  const blocker = hasUnresolvedBlocker(snapshot.comments.items);

  const [reviewBody, setReviewBody] = useState(draft?.body ?? "");
  const [reviewType, setReviewType] = useState<CritiqueType>(draft?.critique_type ?? "note");

  // The note persists the moment the popover closes: a new pending review
  // comment if none exists yet, otherwise an edit of the standing draft.
  // Submit later publishes it with the rest of the round.
  function handleOpenChange(open: boolean) {
    if (open) {
      setReviewBody(draft?.body ?? "");
      setReviewType(draft?.critique_type ?? "note");
      return;
    }
    const text = reviewBody.trim();
    if (!text || (draft && text === draft.body && reviewType === draft.critique_type)) return;
    if (draft) {
      void commands.editComment.dispatch({
        comment_id: draft.id,
        body: text,
        critique_type: reviewType,
      });
    } else {
      void commands.addComment.dispatch({
        scope: "review",
        critique_type: reviewType,
        body: text,
        start_line: null,
        end_line: null,
      });
    }
  }

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            title="File review verdict"
            className={
              verdict === "request_changes"
                ? "border-red/40 bg-red-soft hover:bg-red-soft"
                : verdict === "approve"
                  ? "border-green/40 bg-green/15 hover:bg-green/20"
                  : undefined
            }
          >
            <VerdictIcon verdict={verdict} />
            <ChevronDown size={13} className="text-faint" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex flex-col gap-0.5">
          {VERDICTS.map((option) => (
            <button
              key={option}
              type="button"
              className={`flex items-start gap-2 rounded px-2 py-1.5 text-left ${
                verdict === option ? "bg-tint" : "hover:bg-hover"
              }`}
              onClick={() => onVerdictChange(option)}
            >
              <span className="mt-0.5">
                <VerdictIcon verdict={option} size={14} />
              </span>
              <span className="flex flex-col">
                <strong className="text-[13px] text-heading">{VERDICT_META[option].label}</strong>
                <small className="text-[11px] text-muted-foreground">
                  {VERDICT_META[option].description}
                </small>
              </span>
            </button>
          ))}
          {blocker && verdict === "approve" && (
            <p className="mt-1 rounded bg-amber-soft px-2 py-1 text-[11px] text-amber">
              Unresolved <b>fix_required</b>; approve anyway?
            </p>
          )}

          <div className="mt-1 border-t border-line-soft pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-faint">Review comment</span>
              <div className="flex gap-1">
                {TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-lg border px-2 py-0.5 text-[10px] transition-colors ${
                      reviewType === option
                        ? "border-transparent bg-blue text-on-accent"
                        : "border-line bg-transparent text-faint hover:bg-hover"
                    }`}
                    onClick={() => setReviewType(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="min-h-16 w-full resize-y rounded border border-line bg-control px-2 py-1.5 text-[12px] focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25"
              placeholder="Comment on the whole review. Published on submit."
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The standing review-scoped pending note for this round, if one was drafted. */
function reviewDraft(comments: Comment[]): Comment | undefined {
  return comments.find((c) => c.scope === "review" && c.status === "pending" && !c.anchor);
}
