import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Check, ChevronDown, ClipboardCheck, ClipboardList, Copy, Send } from "lucide-react";

import { buildReviewCopyText, copyToClipboard, type CopyMode } from "./copy";
import { type Comment, type FileSnapshot, type ReviewSnapshot } from "./types";
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  function copy(mode: CopyMode) {
    const files = (reviewSnapshot.files ?? []) as unknown as FileSnapshot[];
    const text = buildReviewCopyText(
      reviewSnapshot.name,
      files.map((file) => ({
        title: file.artifact.title,
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
            <DialogTitle>Submit this review?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Applies every verdict chip you have set and publishes all pending comments across the
            review.
          </p>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <ButtonGroup className="w-full sm:w-auto">
              <Button size="sm" className="grow sm:grow-0" disabled={disabled} onClick={submit}>
                <Check size={14} /> Submit
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
