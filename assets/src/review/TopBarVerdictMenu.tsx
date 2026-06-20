import { useEffect, useRef, useState } from "react";
import { CircleDashed, ClipboardCheck, Construction, MessageCircleMore } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";

import { useReviewCommands } from "./commands";
import { COMMIT_PULSE_TRANSITION, commitPulse } from "./motion";
import { ComposerTextarea } from "./ComposerTextarea";
import { hasUnresolvedBlocker } from "./store-context";
import { VERDICT_META, type Comment, type Verdict } from "./types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Drives the trigger copy for both per-file (`file`) and review-scope (`review`)
 * verdict pickers. The label states the scope explicitly so the affordance no
 * longer relies on position alone to disambiguate. */
export type VerdictScope = "file" | "review";

const VERDICTS: Verdict[] = ["comment", "request_changes", "approve"];

/** Verdict icon used in the trigger and each option row. `approve` a green
 * clipboard-check (signed off), `request_changes` a red construction barrier
 * (work in progress), `comment` a speech bubble with ellipsis (feedback), and
 * an unset verdict (`null`) the dashed empty ring — so an untouched file reads
 * as "no verdict yet" rather than a neutral comment. */
export function VerdictIcon(props: {
  verdict: Verdict | null;
  size?: number;
  className?: string;
}) {
  if (props.verdict === "approve")
    return (
      <ClipboardCheck
        size={props.size ?? 15}
        className={`text-green-text ${props.className ?? ""}`}
      />
    );
  if (props.verdict === "request_changes")
    return <Construction size={props.size ?? 15} className={`text-red ${props.className ?? ""}`} />;
  if (props.verdict === "comment")
    return (
      <MessageCircleMore
        size={props.size ?? 15}
        className={`text-muted-foreground ${props.className ?? ""}`}
      />
    );
  return (
    <CircleDashed size={props.size ?? 15} className={`text-faint ${props.className ?? ""}`} />
  );
}

const VERDICT_TONE: Record<Verdict, string> = {
  approve: "bg-green/15 text-green-text ring-1 ring-inset ring-green/30",
  request_changes: "bg-red-soft text-red ring-1 ring-inset ring-red/30",
  comment: "bg-tint text-heading ring-1 ring-inset ring-line",
};

const UNSET_TONE = "bg-tint text-heading ring-1 ring-inset ring-line";

/**
 * Compact verdict control: a single chip reflecting the file's current verdict;
 * clicking opens a popover with the verdict choice plus an optional note. Picking
 * a verdict auto-saves the draft verdict and leaves the popover open so the user
 * can still type a note; the note auto-saves as a pending comment on blur. Pass
 * `showNote={false}` for cramped per-file headers in all-files mode.
 */
export function FileVerdictMenu(props: {
  verdict: Verdict | null;
  onVerdictChange: (verdict: Verdict) => void;
  /** The comment thread this menu's note belongs to. Drives the optional
   * auto-saving note: an existing pending, anchorless comment in this thread is
   * the live draft that the textarea edits or clears. */
  comments: Comment[];
  showNote?: boolean;
  /** Scope of the verdict being controlled. Defaults to `"file"` so the
   * single-file header chip is conceptually identical to the per-card chip in
   * all-files mode: both set the active artifact's verdict and attach a
   * file-scope note. */
  scope?: VerdictScope;
}) {
  const { verdict, onVerdictChange, comments, showNote = true, scope = "file" } = props;
  const commands = useReviewCommands();
  const draft = noteDraft(comments, scope);
  const blocker = hasUnresolvedBlocker(comments);

  // Acknowledge a verdict *change* with a single pulse. Tracked against the
  // previous verdict so the chip stays still on mount (the all-files stack
  // renders many of these at once).
  const reduced = useReducedMotion() ?? false;
  const pulse = useAnimationControls();
  const prevVerdict = useRef(verdict);
  useEffect(() => {
    if (prevVerdict.current === verdict) return;
    prevVerdict.current = verdict;
    const keyframe = commitPulse(reduced);
    if (keyframe) void pulse.start({ ...keyframe, transition: COMMIT_PULSE_TRANSITION });
  }, [verdict, reduced, pulse]);

  const [open, setOpen] = useState(false);
  const [noteBody, setNoteBody] = useState(draft?.body ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  // Focus the currently selected verdict on open so keyboard users land on
  // the live choice (not the first option). Base UI's Popover steals focus
  // on open via its own effect, so we wait a frame past it before grabbing
  // focus back on the selected item.
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let frame2: number | undefined;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        selectedRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [open, verdict]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNoteBody(draft?.body ?? "");
      setNoteError(null);
    }
  }

  // Auto-save the optional note. Picking a verdict no longer closes the popover,
  // so the note persists silently on blur: a non-empty body edits the live draft
  // or adds a new pending `note` comment; an emptied body clears the draft.
  async function saveNote() {
    const text = noteBody.trim();
    setNoteError(null);
    try {
      if (text === "") {
        if (draft) await commands.deleteComment.dispatch({ comment_id: draft.id });
        return;
      }
      if (draft) {
        if (text === draft.body) return;
        await commands.editComment.dispatch({
          comment_id: draft.id,
          body: text,
          critique_type: draft.critique_type,
        });
      } else {
        await commands.addComment.dispatch({
          scope: scope === "review" ? "review" : "artifact",
          critique_type: "note",
          body: text,
          anchor: null,
        });
      }
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : "Could not save note");
    }
  }

  const hasNote = showNote && Boolean(draft);
  const scopePrefix = scope === "file" ? "File verdict" : "Review verdict";
  const noteLabel = scope === "file" ? "File note" : "Review note";
  const verdictLabel = verdict ? VERDICT_META[verdict].label : "None";
  const triggerLabel = hasNote
    ? `${scopePrefix}: ${verdictLabel} (${noteLabel.toLowerCase()} attached)`
    : `${scopePrefix}: ${verdictLabel}`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="icon-xs"
            title={triggerLabel}
            aria-label={triggerLabel}
            className={`relative ${verdict ? VERDICT_TONE[verdict] : UNSET_TONE}`}
          >
            <motion.span animate={pulse} className="inline-flex">
              <VerdictIcon verdict={verdict} size={13} />
            </motion.span>
            {hasNote && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-blue ring-2 ring-surface"
              />
            )}
          </Button>
        }
      />
      {/* The trigger card can be filtered out (e.g. hide-reviewed) the moment a
          verdict is committed, detaching the anchor while the popover is still
          running its close animation. Floating UI's layout-shift observer would
          then call getBoundingClientRect on the stale node and throw; anchor
          tracking is unnecessary for this short-lived menu, so disable it. */}
      <PopoverContent align="end" className="w-72 p-2" disableAnchorTracking>
        <div className="flex flex-col gap-0.5">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-faint">
            {scopePrefix}
          </p>
          {VERDICTS.map((option) => (
            <button
              key={option}
              type="button"
              ref={verdict === option ? selectedRef : undefined}
              aria-current={verdict === option ? "true" : undefined}
              className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 ${
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
            <p className="mt-1 rounded-md bg-amber-soft px-2 py-1 text-[11px] text-amber">
              Unresolved <b>fix_required</b>; approve anyway?
            </p>
          )}

          {showNote && (
            <div className="mt-1 border-t border-line-soft pt-2">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-faint">
                {noteLabel} (optional)
              </span>
              <ComposerTextarea
                className="min-h-16 rounded-md text-[12px]"
                placeholder={
                  scope === "file"
                    ? "Comment on this file. Saved automatically, published on submit."
                    : "Comment on the whole review. Saved automatically, published on submit."
                }
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onBlur={() => void saveNote()}
              />
              {noteError && (
                <p className="mt-1 text-[11px] text-red" role="alert">
                  {noteError}
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The standing pending, anchorless note for this menu's scope, if one was
 * drafted — the comment the optional textarea edits or clears. */
function noteDraft(comments: Comment[], scope: VerdictScope): Comment | undefined {
  const wantScope = scope === "review" ? "review" : "artifact";
  return comments.find((c) => c.scope === wantScope && c.status === "pending" && !c.anchor);
}
