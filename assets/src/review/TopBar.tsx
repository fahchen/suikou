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
  Send,
} from "lucide-react";

import { usePrefetchReviewStore, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { TopBarShell } from "./TopBarShell";
import { useReviewCommands } from "./commands";
import { useFileStore } from "./store-context";
import { buildCopyText, copyToClipboard, type CopyMode } from "./copy";
import { isImagePath, isBinaryContent } from "./file-type";
import { adjacentReviewFiles } from "./file-order";
import { reviewFileTarget } from "./review-navigation";
import { type ReviewFileEntry, type ReviewSnapshot } from "./types";
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

  // Review-level Submit gates on any unpublished work — a draft verdict on any
  // file, or a pending (not-yet-published) comment or reply anywhere in the
  // review. Computed server-side on the root so it tracks every file, not just
  // the active one.
  const hasUnpublishedWork = reviewSnapshot.has_unpublished;

  function submit() {
    void commands.submitReview.dispatch({});
    setConfirmOpen(false);
  }

  function submitAndCopy(mode: CopyMode) {
    copyComments(mode);
    submit();
  }

  const fileEntries = reviewSnapshot.file_entries.data ?? [];
  const { prev: prevFile, next: nextFile } = adjacentReviewFiles(fileEntries, fileSnapshot.path);
  const showFileNav = uiStore.fileDisplayMode === "single";

  async function navigateToFile(file: ReviewFileEntry, dir: "prev" | "next") {
    setNavPending(dir);
    try {
      void navigate(reviewFileTarget(reviewSnapshot.review_id, file.path, rawView));
    } finally {
      setNavPending(null);
    }
  }

  const fileNav = showFileNav && (
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
  );

  return (
    <TopBarShell
      left={fileNav}
      right={
        <>
          <TopBarRoundMenu />
          {commentsSupported && (
            <Button
              variant="pill"
              size="icon"
              title={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
              aria-label={
                uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"
              }
              onClick={() => uiStore.toggleCollapseAll()}
            >
              {uiStore.commentsCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
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
              disabled={!hasUnpublishedWork || commands.submitReview.disabled}
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
                <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
                <ButtonGroup className="w-full sm:w-auto">
                  <Button
                    size="sm"
                    className="grow sm:grow-0"
                    disabled={!hasUnpublishedWork || commands.submitReview.disabled}
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
                          disabled={!hasUnpublishedWork || commands.submitReview.disabled}
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
      }
    />
  );
});
