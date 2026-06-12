import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Home,
  Send,
} from "lucide-react";

import { uiStore } from "../stores/ui-store";
import { useReviewCommands } from "./commands";
import { pendingCount } from "./store-context";
import { buildCopyText, copyToClipboard, type CopyMode } from "./copy";
import { VERDICT_META, type ReviewSnapshot, type Verdict } from "./types";
import { TopBarTocMenu } from "./TopBarTocMenu";
import { TopBarArtifactMenu } from "./TopBarArtifactMenu";
import { TopBarRoundMenu } from "./TopBarRoundMenu";
import { TopBarDisplayMenu } from "./TopBarDisplayMenu";
import { TopBarVerdictMenu, VerdictIcon } from "./TopBarVerdictMenu";
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

// Split-button seam: the theme's primary, darkened, so the divider reads as a
// deliberate seam on the filled button and tracks every [data-theme] palette.
const SPLIT_SEAM = "bg-[color-mix(in_oklch,var(--primary),black_22%)]";

export const TopBar = observer(function TopBar(props: {
  snapshot: ReviewSnapshot;
  previewable: boolean;
}) {
  const { snapshot, previewable } = props;
  const commands = useReviewCommands();
  const navigate = useNavigate();
  const rawView = useLocation().pathname.endsWith("/raw");
  const [verdict, setVerdict] = useState<Verdict>(
    snapshot.draft_verdict ?? snapshot.latest_verdict ?? "request_changes",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pending = pendingCount(snapshot.comments.items);

  function changeVerdict(next: Verdict) {
    setVerdict(next);
    void commands.setDraftVerdict.dispatch({ verdict: next });
  }

  function copyComments(mode: CopyMode) {
    const text = buildCopyText(
      snapshot.artifact.title,
      snapshot.current_round.number,
      snapshot.comments.items,
      mode,
    );
    void copyToClipboard(text);
  }

  function submit() {
    void commands.submitReview.dispatch({ verdict });
    setConfirmOpen(false);
  }

  function submitAndCopy(mode: CopyMode) {
    copyComments(mode);
    submit();
  }

  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <Button
          variant="pill"
          size="icon-xs"
          className="size-[30px]"
          title="Project board"
          aria-label="Project board"
          onClick={() => void navigate({ to: "/" })}
        >
          <Home className="size-4 text-muted-foreground" />
        </Button>
        <TopBarTocMenu
          content={snapshot.current_round.content}
          path={snapshot.artifact.title}
        />
        <TopBarArtifactMenu snapshot={snapshot} rawView={rawView} />
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarRoundMenu snapshot={snapshot} />
        <Button
          variant="pill"
          size="icon-xs"
          className="size-[30px]"
          title={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
          aria-label={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
          onClick={() => uiStore.toggleCollapseAll()}
        >
          {uiStore.commentsCollapsed ? (
            <ChevronsUpDown className="size-4" />
          ) : (
            <ChevronsDownUp className="size-4" />
          )}
        </Button>
        <TopBarDisplayMenu
          artifactId={snapshot.artifact.id}
          rawView={rawView}
          previewable={previewable}
        />
        <TopBarVerdictMenu snapshot={snapshot} verdict={verdict} onVerdictChange={changeVerdict} />

        <ButtonGroup>
          <Button
            size="icon-xs"
            className="size-[30px]"
            title="Submit review"
            aria-label="Submit review"
            onClick={() => setConfirmOpen(true)}
          >
            <Send size={14} />
          </Button>
          <ButtonGroupSeparator className={SPLIT_SEAM} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-xs"
                  className="size-[30px]"
                  title="Copy comments"
                  aria-label="Copy comments"
                />
              }
            >
              <Copy size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => copyComments("noteworthy")}>
                <ClipboardCheck size={14} />
                Copy noteworthy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyComments("all")}>
                <ClipboardList size={14} />
                Copy all comments
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <VerdictIcon verdict={verdict} size={16} />
                Submit this review?
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
              Files the <b className="text-heading">{VERDICT_META[verdict].label}</b> verdict
              {pending > 0
                ? ` and publishes ${pending} pending comment${pending === 1 ? "" : "s"}`
                : ""}
              .
            </p>

            <DialogFooter>
              <DialogClose
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 sm:h-7"
                  />
                }
              >
                Cancel
              </DialogClose>
              <ButtonGroup className="w-full sm:w-auto">
                <Button
                  size="sm"
                  className="h-10 grow sm:h-7 sm:grow-0"
                  disabled={commands.submitReview.isPending}
                  onClick={submit}
                >
                  <Check size={14} /> Submit
                </Button>
                <ButtonGroupSeparator className={SPLIT_SEAM} />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        className="h-10 w-10 sm:size-7"
                        title="Submit and copy"
                        aria-label="Submit and copy"
                        disabled={commands.submitReview.isPending}
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
      </div>
    </header>
  );
});
