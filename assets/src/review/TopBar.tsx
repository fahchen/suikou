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

import { usePrefetchReviewStore } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { useReviewCommands } from "./commands";
import { buildCopyText, copyToClipboard, type CopyMode } from "./copy";
import { isImagePath, isBinaryContent } from "./file-type";
import { adjacentReviewFiles } from "./file-order";
import { VERDICT_META, type ReviewFileEntry, type ReviewSnapshot, type Verdict } from "./types";
import { TopBarRoundMenu } from "./TopBarRoundMenu";
import { TopBarDisplayMenu } from "./TopBarDisplayMenu";
import { VerdictIcon } from "./TopBarVerdictMenu";
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
// as a deliberate seam on the filled button. `--accent-seam` is derived per
// theme via relative-OKLCH so the seam tracks light vs. dark palettes.
const SPLIT_SEAM = "bg-accent-seam";

export const TopBar = observer(function TopBar(props: {
  snapshot: ReviewSnapshot;
  previewable: boolean;
  content: string;
  verdict: Verdict | null;
}) {
  const { snapshot, previewable, content, verdict } = props;
  const commands = useReviewCommands();
  const navigate = useNavigate();
  const prefetchReview = usePrefetchReviewStore();
  const rawView = useLocation().pathname.endsWith("/raw");
  const wide = useMediaQuery(WIDE_QUERY);
  const title = snapshot.artifact.title;
  const image = isImagePath(title);
  const binary = isBinaryContent(content);
  // Comments anchor to editor lines; an image or other binary has none.
  const commentsSupported = !image && !binary;
  const viewKind = resolveViewKind(snapshot.artifact);
  const capabilities = viewCapabilities({
    kind: viewKind,
    previewable,
    image,
    rawView,
    binary,
  });
  const [navError, setNavError] = useState<string | null>(null);
  const [navPending, setNavPending] = useState<"prev" | "next" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function copyComments(mode: CopyMode) {
    const text = buildCopyText(
      snapshot.artifact.title,
      snapshot.current_round.number,
      snapshot.comments.items,
      mode,
    );
    void copyToClipboard(text);
  }

  // An untouched file has no verdict (`null`); submitting it records a plain
  // comment rather than blocking the review.
  const submitVerdict: Verdict = verdict ?? "comment";

  function submit() {
    void commands.submitReview.dispatch({ verdict: submitVerdict });
    setConfirmOpen(false);
  }

  function submitAndCopy(mode: CopyMode) {
    copyComments(mode);
    submit();
  }

  // Tree-order neighbours (folders before files, alphabetical) so prev/next
  // steps in lockstep with the file tree — not raw array order.
  const { prev: prevFile, next: nextFile } = adjacentReviewFiles(
    snapshot.files.data ?? [],
    snapshot.artifact.id,
  );
  // Single-file mode only: in all-files mode the user already sees every file
  // stacked, so stepping is meaningless.
  const showFileNav = uiStore.fileDisplayMode === "single";

  async function navigateToFile(file: ReviewFileEntry, dir: "prev" | "next") {
    setNavError(null);
    setNavPending(dir);
    try {
      let id = file.artifact_id;
      if (!id) {
        uiStore.setMintingPath(file.path);
        const reply = await commands.openFile.dispatch({ path: file.path });
        if (!reply.artifact_id) {
          setNavError(reply.error ?? "Could not open file");
          uiStore.setMintingPath(null);
          return;
        }
        id = reply.artifact_id;
      }
      void navigate({
        to: rawView ? "/review/$artifactId/raw" : "/review/$artifactId",
        params: { artifactId: id },
      });
    } finally {
      setNavPending(null);
    }
  }

  return (
    <header className="pointer-events-none sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <Button
          variant="pill"
          size="icon-xs"
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
              size="icon-xs"
              title={prevFile ? `Previous file (${prevFile.path})` : "No previous file"}
              aria-label="Previous file"
              disabled={!prevFile || navPending !== null}
              onClick={() => prevFile && void navigateToFile(prevFile, "prev")}
              onMouseEnter={() => prevFile?.artifact_id && prefetchReview(prevFile.artifact_id)}
              onFocus={() => prevFile?.artifact_id && prefetchReview(prevFile.artifact_id)}
            >
              <ChevronLeft className="text-muted-foreground" />
            </Button>
            <ButtonGroupSeparator />
            <Button
              variant="pill"
              size="icon-xs"
              title={nextFile ? `Next file (${nextFile.path})` : "No next file"}
              aria-label="Next file"
              disabled={!nextFile || navPending !== null}
              onClick={() => nextFile && void navigateToFile(nextFile, "next")}
              onMouseEnter={() => nextFile?.artifact_id && prefetchReview(nextFile.artifact_id)}
              onFocus={() => nextFile?.artifact_id && prefetchReview(nextFile.artifact_id)}
            >
              <ChevronRight className="text-muted-foreground" />
            </Button>
          </ButtonGroup>
        )}
        {navError && (
          <span className="hidden text-[11px] text-red sm:inline" role="alert">
            {navError}
          </span>
        )}
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarRoundMenu snapshot={snapshot} />
        {commentsSupported && (
          <Button
            variant="pill"
            size="icon-xs"
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
          artifactId={snapshot.artifact.id}
          rawView={rawView}
          capabilities={capabilities}
          viewKind={viewKind}
          diffLayoutAllowed={wide}
          sideCommentsAllowed={wide}
        />

        <ButtonGroup className="rounded-lg shadow-[0_0_0_1px_var(--line),var(--elev-1)]">
          <Button
            size="icon-xs"
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
                <VerdictIcon verdict={submitVerdict} size={16} />
                Submit this review?
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Applies <b className="text-heading">{VERDICT_META[submitVerdict].label}</b> to this file
              and publishes every pending comment across the review.
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
