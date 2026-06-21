import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { usePrefetchReviewStore, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { TopBarShell } from "./TopBarShell";
import { SubmitControls } from "./SubmitControls";
import { useReviewCommands } from "./commands";
import { useFileStore } from "./store-context";
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

  // Review-level Submit gates on any unpublished work — a draft verdict on any
  // file, or a pending (not-yet-published) comment or reply anywhere in the
  // review. Computed server-side on the root so it tracks every file, not just
  // the active one.
  const hasUnpublishedWork = reviewSnapshot.has_unpublished;

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

          <SubmitControls
            reviewSnapshot={reviewSnapshot}
            disabled={!hasUnpublishedWork || commands.submitReview.disabled}
            onSubmit={() => void commands.submitReview.dispatch({})}
          />
        </>
      }
    />
  );
});
