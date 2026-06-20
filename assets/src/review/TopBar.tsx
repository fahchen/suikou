import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Home,
  Send,
} from "lucide-react";

import { usePrefetchReviewStore, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { useReviewCommands } from "./commands";
import { useFileStore } from "./store-context";
import { buildCopyText, copyToClipboard, type CopyMode } from "./copy";
import { isImagePath, isBinaryContent } from "./file-type";
import { adjacentReviewFiles } from "./file-order";
import { reviewFileTarget } from "./review-navigation";
import { type FileSnapshot, type ReviewFileEntry, type ReviewSnapshot } from "./types";
import { TopBarRoundMenu } from "./TopBarRoundMenu";
import { TopBarDisplayMenu } from "./TopBarDisplayMenu";
import { resolveViewKind, viewCapabilities } from "./view-kind";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
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

export const TopBar = observer(function TopBar(props: {
  reviewSnapshot: ReviewSnapshot;
  previewable: boolean;
  content: string;
}) {
  const { reviewSnapshot, previewable, content } = props;
  const commands = useReviewCommands();
  const navigate = useNavigate();
  const prefetchReview = usePrefetchReviewStore();
  const rawView = useLocation().pathname.endsWith("/raw");
  const wide = useMediaQuery(WIDE_QUERY);

  // Per-file data from the FileStore context (always present in single-file view).
  const fileStore = useFileStore();
  const fileSnapshot = useMusubiSnapshot(fileStore);

  const title = fileSnapshot.artifact.title;
  const image = isImagePath(title);
  const binary = isBinaryContent(content);
  const commentsSupported = !image && !binary;
  const viewKind = resolveViewKind({ kind: reviewSnapshot.kind, title });
  const capabilities = viewCapabilities({
    kind: viewKind,
    previewable,
    image,
    rawView,
    binary,
  });
  const [navPending, setNavPending] = useState<"prev" | "next" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function copyComments(mode: CopyMode) {
    const text = buildCopyText(
      title,
      fileSnapshot.current_round.number,
      fileSnapshot.comments.items,
      mode,
    );
    void copyToClipboard(text);
  }

  // Review-level Submit gates on any file carrying a draft verdict chip, read
  // from the review root's FileStore children — identical to the all-files shell.
  const reviewFiles = reviewSnapshot.files as unknown as FileSnapshot[];
  const hasAnyDraftVerdict = reviewFiles.some((f) => f.draft_verdict !== null);

  function submit() {
    void commands.submitReview.dispatch({});
    setConfirmOpen(false);
  }

  function submitAndCopy(mode: CopyMode) {
    copyComments(mode);
    submit();
  }

  const fileEntries = reviewSnapshot.file_entries.data ?? [];
  const { prev: prevFile, next: nextFile } = adjacentReviewFiles(
    fileEntries,
    fileSnapshot.artifact.id,
  );
  const showFileNav = uiStore.fileDisplayMode === "single";

  async function navigateToFile(file: ReviewFileEntry, dir: "prev" | "next") {
    setNavPending(dir);
    try {
      void navigate(reviewFileTarget(reviewSnapshot.review_id, file.path, rawView));
    } finally {
      setNavPending(null);
    }
  }

  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <Button
          variant="pill"
          size="icon"
          title="Project board"
          aria-label="Project board"
          onClick={() => void navigate({ to: "/" })}
        >
          <Home className="text-muted-foreground" />
        </Button>
        {showFileNav && (
          <ButtonGroup className="rounded-lg shadow-[0_0_0_1px_var(--line),var(--elev-1)]">
            <Button
              variant="pill"
              size="icon"
              title={prevFile ? `Previous file (${prevFile.path})` : "No previous file"}
              aria-label="Previous file"
              disabled={!prevFile || navPending !== null}
              onClick={() => prevFile && void navigateToFile(prevFile, "prev")}
              onMouseEnter={() => prevFile && prefetchReview(reviewSnapshot.review_id)}
              onFocus={() => prevFile && prefetchReview(reviewSnapshot.review_id)}
            >
              <ChevronLeft className="text-muted-foreground" />
            </Button>
            <ButtonGroupSeparator />
            <Button
              variant="pill"
              size="icon"
              title={nextFile ? `Next file (${nextFile.path})` : "No next file"}
              aria-label="Next file"
              disabled={!nextFile || navPending !== null}
              onClick={() => nextFile && void navigateToFile(nextFile, "next")}
              onMouseEnter={() => nextFile && prefetchReview(reviewSnapshot.review_id)}
              onFocus={() => nextFile && prefetchReview(reviewSnapshot.review_id)}
            >
              <ChevronRight className="text-muted-foreground" />
            </Button>
          </ButtonGroup>
        )}
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarRoundMenu />
        {commentsSupported && (
          <Button
            variant="pill"
            size="icon"
            title={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
            aria-label={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
            onClick={() => uiStore.toggleCollapseAll()}
          >
            {uiStore.commentsCollapsed ? (
              <ChevronsUpDown />
            ) : (
              <ChevronsDownUp />
            )}
          </Button>
        )}
        <TopBarDisplayMenu
          reviewId={reviewSnapshot.review_id}
          filePath={title}
          rawView={rawView}
          capabilities={capabilities}
          viewKind={viewKind}
          diffLayoutAllowed={wide}
          sideCommentsAllowed={wide}
        />

        <ButtonGroup className="rounded-lg shadow-[0_0_0_1px_var(--line),var(--elev-1)]">
          <Button
            size="icon"
            title="Submit review"
            aria-label="Submit review"
            disabled={!hasAnyDraftVerdict || commands.submitReview.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Send size={14} />
          </Button>
          <ButtonGroupSeparator className={SPLIT_SEAM} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon"
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
              <DialogTitle>Submit this review?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Applies every verdict chip you have set and publishes all pending comments across
              the review.
            </p>

            <DialogFooter>
              <DialogClose
                render={
                  <Button
                    variant="outline"
                    size="sm"
                  />
                }
              >
                Cancel
              </DialogClose>
              <ButtonGroup className="w-full sm:w-auto">
                <Button
                  size="sm"
                  className="grow sm:grow-0"
                  disabled={!hasAnyDraftVerdict || commands.submitReview.isPending}
                  onClick={submit}
                >
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
                        disabled={!hasAnyDraftVerdict || commands.submitReview.isPending}
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
