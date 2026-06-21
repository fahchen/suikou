import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";
import { Check, Home, Send } from "lucide-react";

import { storeCache, useMusubiRoot, useMusubiSnapshot, useMusubiCommand, useSocketConnected } from "../musubi";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { ConnectionPill } from "../review/ConnectionPill";
import { ReviewStoreProvider } from "../review/store-context";
import { AllFilesView } from "../review/views/AllFilesView";
import { ReviewShellSkeleton } from "../review/ArtifactReviewShell";
import { TopBarDisplayMenu } from "../review/TopBarDisplayMenu";
import { viewCapabilities } from "../review/view-kind";
import { Centered } from "../components/centered";
import { ErrorPage, errorCopy } from "../components/error-page";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReviewStore } from "../review/types";
import type { FileSnapshot } from "../review/types";

// Split-button seam colour — mirrors the single-file TopBar.
const SPLIT_SEAM = "bg-accent-seam";

export const Route = createFileRoute("/reviews/$reviewId/")({
  component: ReviewLandingRoute,
});

function ReviewLandingRoute() {
  const { reviewId } = Route.useParams();
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: reviewId,
    params: { review_id: reviewId },
    cache: storeCache,
  });

  if (root.status === "loading") return <ReviewShellSkeleton label="Loading review…" />;
  if (root.status === "error") return <ErrorPage {...errorCopy(root.error.message)} />;

  return (
    <ReviewStoreProvider store={root.store}>
      <AllFilesShell reviewId={reviewId} reviewStore={root.store} />
    </ReviewStoreProvider>
  );
}

const AllFilesShell = observer(function AllFilesShell(props: {
  reviewId: string;
  reviewStore: ReviewStore;
}) {
  const { reviewId, reviewStore } = props;
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const submitReview = useMusubiCommand(reviewStore, "submit_review");
  const connected = useSocketConnected();
  const wide = useMediaQuery(WIDE_QUERY);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // `files` can read undefined for a frame while the socket is dropping and the
  // store snapshot tears down; default to empty so the header can still render.
  const files = (reviewSnapshot.files ?? []) as unknown as FileSnapshot[];
  const hasAnyDraftVerdict = files.some((f) => f.draft_verdict !== null);

  // First file in path order for "One" display mode navigation.
  const firstFilePath = files.length > 0
    ? [...files].sort((a, b) => a.path.localeCompare(b.path))[0].path
    : "";

  // All-files mode: show comments toggle + filter rows, nothing file-specific.
  const allFilesCapabilities = viewCapabilities({
    kind: "file",
    previewable: false,
    image: false,
    rawView: false,
    binary: false,
  });

  function submit() {
    void submitReview.dispatch({});
    setConfirmOpen(false);
  }

  if (files.length === 0 && reviewSnapshot.file_entries?.status !== "loading") {
    return (
      <main className="h-screen overflow-auto bg-canvas text-ink">
        <AllFilesShellHeader
          reviewId={reviewId}
          firstFilePath={firstFilePath}
          allFilesCapabilities={allFilesCapabilities}
          wide={wide}
          hasAnyDraftVerdict={hasAnyDraftVerdict}
          onSubmitClick={() => setConfirmOpen(true)}
          submitPending={submitReview.isPending}
          connected={connected}
        />
        <Centered>
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <strong className="text-heading">No files in this review</strong>
            <span className="text-muted-foreground">
              This review does not currently cover any files.
            </span>
          </div>
        </Centered>
        <SubmitDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onSubmit={submit}
          pending={submitReview.isPending}
        />
      </main>
    );
  }

  return (
    <main className="h-screen overflow-auto bg-canvas text-ink">
      <AllFilesShellHeader
        reviewId={reviewId}
        firstFilePath={firstFilePath}
        allFilesCapabilities={allFilesCapabilities}
        wide={wide}
        hasAnyDraftVerdict={hasAnyDraftVerdict}
        onSubmitClick={() => setConfirmOpen(true)}
        submitPending={submitReview.isPending}
        connected={connected}
      />
      <div className="mx-auto w-full max-w-[1760px] px-3 pb-6 pt-2 sm:px-6 lg:px-10">
        <AllFilesView reviewId={reviewId} reviewSnapshot={reviewSnapshot} reviewStore={reviewStore} />
      </div>
      <SubmitDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onSubmit={submit}
        pending={submitReview.isPending}
      />
    </main>
  );
});

function AllFilesShellHeader(props: {
  reviewId: string;
  firstFilePath: string;
  allFilesCapabilities: ReturnType<typeof viewCapabilities>;
  wide: boolean;
  hasAnyDraftVerdict: boolean;
  onSubmitClick: () => void;
  submitPending: boolean;
  connected: boolean;
}) {
  const navigate = useNavigate();
  const { reviewId, firstFilePath, allFilesCapabilities, wide, hasAnyDraftVerdict, onSubmitClick, submitPending, connected } = props;
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
        <ConnectionPill />
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <TopBarDisplayMenu
          reviewId={reviewId}
          filePath={firstFilePath}
          rawView={false}
          capabilities={allFilesCapabilities}
          viewKind="file"
          diffLayoutAllowed={false}
          sideCommentsAllowed={wide}
        />
        <ButtonGroup className="rounded-lg shadow-[0_0_0_1px_var(--line),var(--elev-1)]">
          <Button
            size="icon"
            title="Submit review"
            aria-label="Submit review"
            disabled={!hasAnyDraftVerdict || submitPending || !connected}
            onClick={onSubmitClick}
          >
            <Send size={14} />
          </Button>
          <ButtonGroupSeparator className={SPLIT_SEAM} />
          <Button
            size="icon-xs"
            title="Submit options"
            aria-label="Submit options"
            disabled
            className="cursor-default"
          />
        </ButtonGroup>
      </div>
    </header>
  );
}

function SubmitDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const { open, onOpenChange, onSubmit, pending } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button size="sm" disabled={pending} onClick={onSubmit}>
            <Check size={14} /> Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
