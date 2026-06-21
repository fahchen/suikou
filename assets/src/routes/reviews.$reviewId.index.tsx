import { createFileRoute } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import {
  storeCache,
  useMusubiRoot,
  useMusubiSnapshot,
  useMusubiCommand,
  useSocketConnected,
} from "../musubi";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import { uiStore } from "../stores/ui-store";
import { ReviewStoreProvider } from "../review/store-context";
import { AllFilesView } from "../review/views/AllFilesView";
import { ReviewShellSkeleton } from "../review/ArtifactReviewShell";
import { TopBarDisplayMenu } from "../review/TopBarDisplayMenu";
import { TopBarRoundMenu } from "../review/TopBarRoundMenu";
import { TopBarShell } from "../review/TopBarShell";
import { SubmitControls } from "../review/SubmitControls";
import { viewCapabilities } from "../review/view-kind";
import { Centered } from "../components/centered";
import { ErrorPage, errorCopy } from "../components/error-page";
import { Button } from "@/components/ui/button";
import type { ReviewSnapshot, ReviewStore } from "../review/types";
import type { FileSnapshot } from "../review/types";

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

  // `files` can read undefined for a frame while the socket is dropping and the
  // store snapshot tears down; default to empty so the header can still render.
  const files = (reviewSnapshot.files ?? []) as unknown as FileSnapshot[];
  const hasAnyDraftVerdict = files.some((f) => f.draft_verdict !== null);

  // First file in path order for "One" display mode navigation.
  const firstFilePath =
    files.length > 0 ? [...files].sort((a, b) => a.path.localeCompare(b.path))[0].path : "";

  // All-files mode: show comments toggle + filter rows, nothing file-specific.
  const allFilesCapabilities = viewCapabilities({
    kind: "file",
    previewable: false,
    image: false,
    rawView: false,
    binary: false,
  });

  const header = (
    <AllFilesShellHeader
      reviewId={reviewId}
      reviewSnapshot={reviewSnapshot}
      firstFilePath={firstFilePath}
      allFilesCapabilities={allFilesCapabilities}
      wide={wide}
      submitDisabled={!hasAnyDraftVerdict || submitReview.isPending || !connected}
      onSubmit={() => void submitReview.dispatch({})}
    />
  );

  if (files.length === 0 && reviewSnapshot.file_entries?.status !== "loading") {
    return (
      <main className="h-screen overflow-auto bg-canvas text-ink">
        {header}
        <Centered>
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <strong className="text-heading">No files in this review</strong>
            <span className="text-muted-foreground">
              This review does not currently cover any files.
            </span>
          </div>
        </Centered>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-auto bg-canvas text-ink">
      {header}
      <div className="mx-auto w-full max-w-[1760px] px-3 pb-6 pt-2 sm:px-6 lg:px-10">
        <AllFilesView
          reviewId={reviewId}
          reviewSnapshot={reviewSnapshot}
          reviewStore={reviewStore}
        />
      </div>
    </main>
  );
});

const AllFilesShellHeader = observer(function AllFilesShellHeader(props: {
  reviewId: string;
  reviewSnapshot: ReviewSnapshot;
  firstFilePath: string;
  allFilesCapabilities: ReturnType<typeof viewCapabilities>;
  wide: boolean;
  submitDisabled: boolean;
  onSubmit: () => void;
}) {
  const {
    reviewId,
    reviewSnapshot,
    firstFilePath,
    allFilesCapabilities,
    wide,
    submitDisabled,
    onSubmit,
  } = props;
  return (
    <TopBarShell
      right={
        <>
          <TopBarRoundMenu />
          <Button
            variant="pill"
            size="icon"
            title={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
            aria-label={uiStore.commentsCollapsed ? "Expand all comments" : "Collapse all comments"}
            onClick={() => uiStore.toggleCollapseAll()}
          >
            {uiStore.commentsCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
          <TopBarDisplayMenu
            reviewId={reviewId}
            filePath={firstFilePath}
            rawView={false}
            capabilities={allFilesCapabilities}
            viewKind="file"
            diffLayoutAllowed={false}
            sideCommentsAllowed={wide}
          />
          <SubmitControls
            reviewSnapshot={reviewSnapshot}
            disabled={submitDisabled}
            onSubmit={onSubmit}
          />
        </>
      }
    />
  );
});
