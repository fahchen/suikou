import { useEffect, useRef, useState } from "react";
import { Outlet, useSearch } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { useMarkdown } from "../markdown/use-markdown";
import { contentErrorFrom, useContent } from "./use-content";
import { useRawHighlight } from "./use-raw-highlight";
import { useMediaQuery, WIDE_QUERY } from "../hooks/use-media-query";
import {
  isFiltering,
  FileStoreProvider,
  ReviewStoreProvider,
  ReviewViewProvider,
  useFileStore,
  useReviewStore,
  visibleComments,
} from "./store-context";
import { TopBar } from "./TopBar";
import { FileHeader } from "./FileHeader";
import { useReviewCommands } from "./commands";
import { CommentRail } from "./CommentRail";
import { useScrollRestore } from "./use-scroll-restore";
import { HtmlAnchorComposer } from "./views/HtmlAnchorComposer";
import { isPreviewable, isImagePath } from "./file-type";
import { isHtmlPath } from "./view-kind";
import { assetBase } from "./urls";
import { ErrorPage, errorCopy } from "@/components/error-page";
import type { ReviewSnapshot, Verdict } from "./types";

/** Mounts the ReviewStore by reviewId and finds the FileStore proxy for `path`. */
export function ArtifactReviewShell(props: { reviewId: string; path: string }) {
  const { reviewId, path } = props;
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ReviewStore",
    id: reviewId,
    params: { review_id: reviewId },
    cache: storeCache,
    keepPreviousData: true,
  });

  if (root.status === "loading") return <ReviewShellSkeleton label="Connecting…" />;
  if (root.status === "error") return <ErrorPage {...errorCopy(root.error.message)} />;

  return (
    <ReviewStoreProvider key={reviewId} store={root.store}>
      <ReviewShell path={path} />
    </ReviewStoreProvider>
  );
}

const ReviewShell = observer(function ReviewShell(props: { path: string }) {
  const reviewStore = useReviewStore();
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const minting = uiStore.mintingPath;

  // Find the FileStore proxy and its snapshot by matching path.
  // snapshot.files[i] and reviewStore.files[i] are parallel arrays.
  const fileIndex = reviewSnapshot.files.findIndex((fs) => fs.path === props.path);
  const fileSnapshot = fileIndex >= 0 ? reviewSnapshot.files[fileIndex] : undefined;
  const fileProxy = fileIndex >= 0 ? reviewStore.files[fileIndex] : undefined;

  if (!fileSnapshot || !fileProxy) {
    return (
      <>
        <MintProgressStrip path={minting} />
        <ReviewShellSkeleton label={minting ? `Opening ${minting}…` : "Loading file…"} />
      </>
    );
  }

  return (
    <>
      <MintProgressStrip path={minting} />
      <FileStoreProvider store={fileProxy}>
        <HydratedReviewShell reviewSnapshot={reviewSnapshot} />
      </FileStoreProvider>
    </>
  );
});

/** Indeterminate top progress bar while a mint is in flight. */
const MintProgressStrip = observer(function MintProgressStrip(props: { path: string | null }) {
  if (!props.path) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Opening ${props.path}`}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-blue-soft"
    >
      <div className="h-full w-1/3 animate-[mint-strip_1.1s_ease-in-out_infinite] bg-blue" />
    </div>
  );
});

const HydratedReviewShell = observer(function HydratedReviewShell(props: {
  reviewSnapshot: ReviewSnapshot;
}) {
  const { reviewSnapshot } = props;
  const ui = uiStore;
  const commands = useReviewCommands();
  const search = useSearch({ strict: false }) as { view?: string };
  const rawView = search.view === "raw";
  const fileStore = useFileStore();
  const fileSnapshotLive = useMusubiSnapshot(fileStore);

  useEffect(() => {
    if (uiStore.mintingPath) uiStore.setMintingPath(null);
  }, [fileSnapshotLive.artifact.id]);

  const serverVerdict = fileSnapshotLive.draft_verdict ?? fileSnapshotLive.latest_verdict ?? null;
  const [verdict, setVerdict] = useState<Verdict | null>(serverVerdict);
  useEffect(() => {
    setVerdict(serverVerdict);
  }, [serverVerdict]);

  function changeVerdict(next: Verdict) {
    setVerdict(next);
    void commands.setDraftVerdict.dispatch({ verdict: next });
  }

  const wide = useMediaQuery(WIDE_QUERY);
  const title = fileSnapshotLive.artifact.title;
  const previewable = isPreviewable(title);
  const image = isImagePath(title);
  const slash = title.lastIndexOf("/");

  const contentState = useContent(
    fileSnapshotLive.artifact.id,
    fileSnapshotLive.current_round.content_hash,
    !image,
  );
  const { text: content, loading: contentLoading } = contentState;
  const contentError = contentErrorFrom(contentState);

  const reviewKind = reviewSnapshot.kind;

  const blocks = useMarkdown(previewable ? content : "", ui.theme, ui.markdownFlavor, {
    base: assetBase(fileSnapshotLive.artifact.id),
    dir: slash === -1 ? "" : title.slice(0, slash),
  });
  const rawLines = useRawHighlight(content, title, ui.theme);
  const loading = blocks.loading || contentLoading;

  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = fileSnapshotLive.comments.items.map((c) => c.id);
    if (seenIds.current === null) {
      seenIds.current = new Set(ids);
      return;
    }
    for (const id of ids) {
      if (!seenIds.current.has(id)) ui.revealComment(id);
      seenIds.current.add(id);
    }
  });

  const visible = visibleComments(fileSnapshotLive.comments.items, ui.statusFilter, ui.typeFilters);
  const comments = ui.hideComments
    ? visible.filter((c) => ui.revealedCommentIds.includes(c.id))
    : visible;
  const sideMode = ui.commentMode === "side" && wide && !ui.hideComments;

  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  useScrollRestore({
    container: mainEl,
    artifactId: fileSnapshotLive.artifact.id,
    view: rawView ? "raw" : "rendered",
    ready: !loading,
    enabled: true,
  });

  if (!fileSnapshotLive.artifact.id) {
    return (
      <ErrorPage
        label="Gone"
        title="This review no longer exists"
        body="It was deleted while you were viewing it. Head back to the board to pick another."
      />
    );
  }

  return (
    <main ref={setMainEl} className="h-screen overflow-auto bg-canvas text-ink">
      <TopBar
        reviewSnapshot={reviewSnapshot}
        previewable={previewable}
        content={content}
      />

      <div
        className={`mx-auto grid w-full max-w-[1760px] gap-4 px-3 sm:gap-6 sm:px-6 lg:px-10 ${
          sideMode ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        <div className="min-w-0">
          <ReviewViewProvider
            value={{
              snapshot: fileSnapshotLive,
              reviewKind,
              reviewSnapshot,
              content,
              contentError,
              blocks: blocks.blocks,
              loading,
              comments,
              previewable,
              rawLines,
              verdict,
              onVerdictChange: changeVerdict,
            }}
          >
            <article className="overflow-hidden rounded-xl border border-line bg-editor">
              <FileHeader
                reviewSnapshot={reviewSnapshot}
                rawView={rawView}
                content={content}
                verdict={verdict}
                onVerdictChange={changeVerdict}
              />
              <Outlet />
            </article>
          </ReviewViewProvider>
        </div>
        {sideMode && (
          <CommentRail
            comments={comments}
            filtered={isFiltering(ui.statusFilter, ui.typeFilters) || ui.hideComments}
            emptyHint={
              isHtmlPath(title)
                ? "Click any element in the document to start a comment. Threads land here."
                : undefined
            }
            header={
              ui.htmlAnchorTarget && ui.htmlAnchorTarget.artifactId === fileSnapshotLive.artifact.id ? (
                <HtmlAnchorComposer
                  target={ui.htmlAnchorTarget}
                  onClose={() => ui.setHtmlAnchorTarget(null)}
                  variant="rail"
                />
              ) : null
            }
          />
        )}
      </div>
    </main>
  );
});

export function ReviewShellSkeleton(props: { label: string }) {
  return (
    <main
      className="h-screen overflow-hidden bg-canvas text-ink"
      role="status"
      aria-busy="true"
      aria-label={props.label}
    >
      <div className="flex h-12 items-center gap-2 border-b border-line px-3 sm:px-6 lg:px-10">
        <div className="h-5 w-32 animate-pulse rounded bg-soft" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-6 w-14 animate-pulse rounded-full bg-soft" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-soft" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-soft" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1760px] gap-4 px-3 pt-4 sm:gap-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10">
        <div className="overflow-hidden rounded-xl border border-line bg-editor">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <div className="h-4 w-48 animate-pulse rounded bg-soft" />
            <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-soft" />
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-soft"
                style={{ width: `${65 + ((i * 13) % 30)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="h-20 animate-pulse rounded-xl bg-soft" />
          <div className="h-20 animate-pulse rounded-xl bg-soft" />
        </div>
      </div>
      <span className="sr-only">{props.label}</span>
    </main>
  );
}
