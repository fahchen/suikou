import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileText,
  MessageSquare,
  RotateCw,
  Send,
} from "lucide-react";

import { buildReviewCopyText, copyToClipboard, type CopyMode } from "./copy";
import { structureFile, useReviewStructure } from "./use-review-structure";
import { VERDICT_META, type Comment, type FileSnapshot, type ReviewSnapshot, type Verdict } from "./types";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Split-button seam: a darker step of the theme's primary so the divider reads
// as a deliberate seam on the filled button.
const SPLIT_SEAM = "bg-accent-seam";

const VERDICT_TITLE_CLASS: Record<Verdict, string> = {
  request_changes: "text-red",
  approve: "text-green",
  comment: "text-blue",
};

// The review-level verdict is derived from every per-file draft verdict, using
// the same precedence the server applies on submit: any request_changes wins,
// otherwise any comment, otherwise approve when all files have signed off. When
// no file carries a draft the confirm title falls back to the neutral form.
function derivedReviewVerdict(snapshot: ReviewSnapshot): Verdict | null {
  const files = (snapshot.body.files ?? []) as unknown as FileSnapshot[];
  const drafts = files
    .map((f) => f.draft_verdict as Verdict | null)
    .filter((v): v is Verdict => v !== null);
  if (drafts.length === 0) return null;
  if (drafts.includes("request_changes")) return "request_changes";
  if (drafts.includes("comment")) return "comment";
  return "approve";
}

// Every count Submit needs to summarize is already in the review snapshot: the
// per-file comments store carries pending items and pending replies, and the
// files array carries the draft verdicts and the open fix_required blockers
// that stay open for the agent after publish.
function submitCounts(snapshot: ReviewSnapshot) {
  const files = (snapshot.body.files ?? []) as unknown as FileSnapshot[];
  let pendingComments = 0;
  let pendingReplies = 0;
  let openBlockers = 0;
  let draftVerdicts = 0;
  for (const file of files) {
    if (file.draft_verdict) draftVerdicts += 1;
    for (const comment of file.comments?.items ?? []) {
      if (comment.status === "pending") pendingComments += 1;
      if (
        comment.status === "published" &&
        !comment.resolved &&
        comment.critique_type === "fix_required"
      ) {
        openBlockers += 1;
      }
      for (const reply of comment.replies ?? []) {
        if (reply.status === "pending") pendingReplies += 1;
      }
    }
  }
  return { pendingComments, pendingReplies, openBlockers, draftVerdicts };
}

function renderConfirmTitle(snapshot: ReviewSnapshot) {
  const verdict = derivedReviewVerdict(snapshot);
  if (!verdict) return "Submit this review?";
  return (
    <>
      Submit this review as{" "}
      <span className={VERDICT_TITLE_CLASS[verdict]}>{VERDICT_META[verdict].label}</span>?
    </>
  );
}

function renderConfirmBullets(snapshot: ReviewSnapshot) {
  const { pendingComments, pendingReplies, openBlockers, draftVerdicts } = submitCounts(snapshot);
  const bullets: React.ReactNode[] = [];
  bullets.push(
    <ConfirmBullet key="comments" icon={<MessageSquare size={14} />}>
      Publishes <b className="font-[680] text-heading tabular-nums">{pendingComments}</b> pending{" "}
      {pendingComments === 1 ? "comment" : "comments"}
      {pendingReplies > 0 && (
        <>
          {" and "}
          <b className="font-[680] text-heading tabular-nums">{pendingReplies}</b>{" "}
          {pendingReplies === 1 ? "reply" : "replies"}
        </>
      )}{" "}
      across all files
    </ConfirmBullet>,
  );
  if (draftVerdicts > 0) {
    bullets.push(
      <ConfirmBullet key="verdicts" icon={<FileText size={14} />}>
        Records <b className="font-[680] text-heading tabular-nums">{draftVerdicts}</b> draft file{" "}
        {draftVerdicts === 1 ? "verdict" : "verdicts"}
      </ConfirmBullet>,
    );
  }
  bullets.push(
    <ConfirmBullet key="round" icon={<RotateCw size={14} />}>
      Reviewed files advance to the next{" "}
      <b className="font-[680] text-heading">draft round</b>
    </ConfirmBullet>,
  );
  if (openBlockers > 0) {
    bullets.push(
      <ConfirmBullet key="blockers" icon={<AlertTriangle size={14} />} tone="warn">
        <b className="font-[680] text-red tabular-nums">
          {openBlockers} open fix_required
        </b>{" "}
        {openBlockers === 1 ? "stays" : "stay"} open for the agent
      </ConfirmBullet>,
    );
  }
  return bullets;
}

function ConfirmBullet(props: {
  icon: React.ReactNode;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-[9px]">
      <span
        className={`mt-[1px] inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] shadow-[inset_0_0_0_0.5px_var(--line)] ${
          props.tone === "warn"
            ? "bg-red-soft text-red"
            : "bg-canvas text-muted-foreground"
        }`}
        aria-hidden
      >
        {props.icon}
      </span>
      <span className="flex-1 leading-[1.45]">{props.children}</span>
    </li>
  );
}

/**
 * Review-level Submit + Copy controls, shared by the single-file and all-files
 * headers. Copy is always review-wide (every file's comments), so it reads the
 * same in both modes. `onSubmit` performs the actual submit dispatch and
 * `disabled` carries the caller's gating (unpublished work / connection).
 */
export const SubmitControls = observer(function SubmitControls(props: {
  reviewSnapshot: ReviewSnapshot;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const { reviewSnapshot, disabled, onSubmit } = props;
  const structure = useReviewStructure();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function copy(mode: CopyMode) {
    // Comments and the viewed round are live (snapshot); the review name and
    // each file's title are static (structure), joined to the live row by path.
    const files = (reviewSnapshot.body.files ?? []) as unknown as FileSnapshot[];
    const text = buildReviewCopyText(
      structure.name,
      files.map((file) => ({
        title: structureFile(structure, file.path)?.artifact?.title ?? file.path,
        round: file.current_round.number,
        comments: (file.comments?.items ?? []) as unknown as Comment[],
      })),
      mode,
    );
    void copyToClipboard(text);
  }

  function submit() {
    onSubmit();
    setConfirmOpen(false);
  }

  function submitAndCopy(mode: CopyMode) {
    copy(mode);
    submit();
  }

  return (
    <>
      <ButtonGroup className="rounded-lg shadow-[0_0_0_1px_var(--line),var(--elev-1)]">
        <Button
          size="icon"
          title="Submit review"
          aria-label="Submit review"
          disabled={disabled}
          onClick={() => setConfirmOpen(true)}
        >
          <Send size={14} />
        </Button>
        <ButtonGroupSeparator className={SPLIT_SEAM} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon" title="Copy comments" aria-label="Copy comments" />}
          >
            <Copy size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => copy("noteworthy")}>
              <ClipboardCheck size={14} />
              Copy noteworthy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copy("all")}>
              <ClipboardList size={14} />
              Copy all comments
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{renderConfirmTitle(reviewSnapshot)}</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-[10px] text-[13px] leading-relaxed text-text">
            {renderConfirmBullets(reviewSnapshot)}
          </ul>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <ButtonGroup className="w-full sm:w-auto">
              <Button size="sm" className="grow sm:grow-0" disabled={disabled} onClick={submit}>
                <Check size={14} /> Submit review
              </Button>
              <ButtonGroupSeparator className={SPLIT_SEAM} />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-xs"
                      title="Submit and copy"
                      aria-label="Submit and copy"
                      disabled={disabled}
                    />
                  }
                >
                  <ChevronDown size={14} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => submitAndCopy("noteworthy")}>
                    <ClipboardCheck size={14} />
                    Submit and copy noteworthy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => submitAndCopy("all")}>
                    <ClipboardList size={14} />
                    Submit and copy all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
