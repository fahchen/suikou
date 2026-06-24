import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";
import { ArrowRight, FileX, Trash2 } from "lucide-react";

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { useMarkdown } from "../markdown/use-markdown";
import { contentErrorFrom, useContent, useReviewFileContent } from "./use-content";
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
import {
  mergeFileView,
  ReviewStructureProvider,
  structureEntry,
  structureFile,
  useLoadReviewStructure,
  useReviewStructure,
  type ReviewStructure,
} from "./use-review-structure";
import { TopBar } from "./TopBar";
import { FileHeader } from "./FileHeader";
import { useReviewCommands } from "./commands";
import { CommentRail } from "./CommentRail";
import { useScrollRestore } from "./use-scroll-restore";
import { HtmlAnchorComposer } from "./views/HtmlAnchorComposer";
import { isPreviewable, isImagePath } from "./file-type";
import { orderedReviewFiles } from "./file-order";
import { reviewFileParams } from "./review-navigation";
import { isHtmlPath } from "./view-kind";
import { HomeButton } from "./TopBarShell";
import { assetBase } from "./urls";
import { ErrorPage, errorCopy } from "@/components/error-page";
import { Button } from "@/components/ui/button";
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

  // Restore (and scope further edits to) this review's persisted drafts.
  useEffect(() => {
    uiStore.setReviewScope(reviewId);
  }, [reviewId]);

  if (root.status === "loading") return <ReviewShellSkeleton label="Connecting…" />;
  if (root.status === "error") return <ErrorPage {...errorCopy(root.error.message)} />;

  return (
    <ReviewStoreProvider key={reviewId} store={root.store}>
      <ReviewStructureGate path={path} />
    </ReviewStoreProvider>
  );
}

/** Loads the review's static structure from the command before rendering the
 * shell, so chrome, file list, and navigation render from component state
 * (disconnect-proof) rather than the live snapshot. */
function ReviewStructureGate(props: { path: string }) {
  const reviewStore = useReviewStore();
  // The live snapshot bumps `structure_version` whenever the file list reshapes;
  // feeding it to the hook refetches the structure so a newly opened/removed file
  // appears without a reload.
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const { structure, error } = useLoadReviewStructure(
    reviewStore,
    reviewSnapshot?.body?.structure_version,
  );

  if (error !== null) return <ErrorPage {...errorCopy(error)} />;
  if (structure === null) return <ReviewShellSkeleton label="Loading review…" />;

  return (
    <ReviewStructureProvider structure={structure}>
      <ReviewShell path={props.path} />
    </ReviewStructureProvider>
  );
}

const ReviewShell = observer(function ReviewShell(props: { path: string }) {
  const reviewStore = useReviewStore();
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const structure = useReviewStructure();
  const minting = uiStore.mintingPath;

  // The chrome, file list, and navigation render from `structure` (component
  // state), so they survive a disconnect even when the live snapshot is briefly
  // absent. Only the live comment/verdict overlay needs the snapshot.
  const live = reviewSnapshot?.body?.files ?? null;

  // Find the FileStore proxy and its live snapshot by matching path.
  // snapshot.body.files[i] and reviewStore.body.files[i] are parallel arrays.
  const fileIndex = live ? live.findIndex((fs) => fs.path === props.path) : -1;
  const fileSnapshot = fileIndex >= 0 ? live![fileIndex] : undefined;
  const fileProxy = fileIndex >= 0 ? reviewStore.body.files[fileIndex] : undefined;

  if (!fileSnapshot || !fileProxy) {
    // The path resolves to no live file row. While the snapshot is still
    // hydrating or a mint is in flight the skeleton is correct; once the
    // structure has settled and the path is genuinely absent from it
    // (deleted/renamed under a directory selection, or a stale link), prompt
    // the user to jump to one of the review's files rather than stranding them.
    const knownPath = structure.file_entries.some((e) => e.path === props.path);
    if (minting === null && !knownPath) {
      return <MissingFilePrompt structure={structure} path={props.path} />;
    }
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
        <HydratedReviewShell path={props.path} reviewSnapshot={reviewSnapshot as ReviewSnapshot} />
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

function useFileSnapshot() {
  return useMusubiSnapshot(useFileStore());
}
type FileSnapshotLive = ReturnType<typeof useFileSnapshot>;

const HydratedReviewShell = observer(function HydratedReviewShell(props: {
  path: string;
  reviewSnapshot: ReviewSnapshot;
}) {
  const fileSnapshotLive = useFileSnapshot();

  // Undefined while the file store node is absent mid-reconnect.
  if (!fileSnapshotLive) {
    return <ReviewShellSkeleton label="Connecting…" />;
  }

  // Pass the validated snapshot down. The body must NOT re-subscribe via
  // useMusubiSnapshot: a child observer re-renders independently on the next stub
  // frame — before this guard can unmount it — and would crash on the stub.
  return (
    <HydratedReviewBody
      path={props.path}
      reviewSnapshot={props.reviewSnapshot}
      fileSnapshotLive={fileSnapshotLive}
    />
  );
});

const HydratedReviewBody = observer(function HydratedReviewBody(props: {
  path: string;
  reviewSnapshot: ReviewSnapshot;
  fileSnapshotLive: NonNullable<FileSnapshotLive>;
}) {
  const { path, reviewSnapshot, fileSnapshotLive } = props;
  const ui = uiStore;
  const structure = useReviewStructure();
  const commands = useReviewCommands();
  const search = useSearch({ strict: false }) as { view?: string };
  const rawView = search.view === "raw";

  // Overlay the file's static identity (from the structure command) onto its
  // live snapshot (comments/verdicts), joined by path. Renderers read this
  // merged view, so they keep their identity even as the live snapshot sheds
  // its static fields.
  const snapshot = mergeFileView(
    fileSnapshotLive,
    structureFile(structure, path),
    structureEntry(structure, path),
  );

  useEffect(() => {
    if (uiStore.mintingPath) uiStore.setMintingPath(null);
  }, [snapshot.artifact.id]);

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
  const title = snapshot.artifact.title;
  const previewable = isPreviewable(title);
  const image = isImagePath(title);
  const slash = title.lastIndexOf("/");

  // Minted files fetch their reviewed source by artifact; unminted rows (no
  // verdict/comment yet) fetch the live file by path, mirroring all-files mode
  // so a single-file deep link renders before the row is ever touched.
  const minted = Boolean(snapshot.artifact.id);
  const mintedContent = useContent(
    snapshot.artifact.id,
    snapshot.current_round.content_hash,
    minted && !image,
  );
  const unmintedContent = useReviewFileContent(
    structure.review_id,
    snapshot.path,
    snapshot.content_hash,
    !minted && !image,
  );
  const contentState = minted ? mintedContent : unmintedContent;
  const { text: content, loading: contentLoading } = contentState;
  const contentError = contentErrorFrom(contentState);

  const reviewKind = structure.kind;

  const blocks = useMarkdown(previewable ? content : "", ui.theme, ui.markdownFlavor, {
    base: minted ? assetBase(snapshot.artifact.id) : "",
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
    artifactId: snapshot.artifact.id,
    view: rawView ? "raw" : "rendered",
    ready: !loading,
    enabled: true,
  });

  // Genuinely gone: an untouched row whose source is missing at head (no blob
  // hash). A present-but-unminted file still has a hash and renders normally.
  // The review chrome stays; only the content body reports the missing file.
  const missing = !minted && snapshot.content_hash === null;

  return (
    <main ref={setMainEl} className="h-screen overflow-auto bg-canvas text-ink">
      <TopBar reviewSnapshot={reviewSnapshot} previewable={previewable} content={content} />

      <div
        className={`mx-auto grid w-full max-w-[1760px] gap-4 px-3 sm:gap-6 sm:px-6 lg:px-10 ${
          sideMode ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        <div className="min-w-0">
          <ReviewViewProvider
            value={{
              snapshot,
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
                rawView={rawView}
                content={content}
                verdict={verdict}
                onVerdictChange={changeVerdict}
              />
              {missing ? (
                <MissingFilePanel
                  reviewId={structure.review_id}
                  path={snapshot.path}
                  kind={structure.kind}
                />
              ) : (
                <Outlet />
              )}
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
              ui.htmlAnchorTarget &&
              ui.htmlAnchorTarget.artifactId === snapshot.artifact.id ? (
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

/**
 * File-scoped "no reviewable content" panel: the review itself is intact, but
 * this one file has no artifact — its source was deleted or moved since the
 * review was created. Renders inside the file card so the review chrome stays.
 * File-selection reviews offer to drop the row; diff reviews derive their file
 * list from the diff, so the action is omitted there.
 */
const MissingFilePanel = observer(function MissingFilePanel(props: {
  reviewId: string;
  path: string;
  kind: "file" | "diff";
}) {
  const commands = useReviewCommands();
  const navigate = useNavigate();

  async function remove() {
    await commands.removeFile.dispatch({ path: props.path });
    void navigate({ to: "/reviews/$reviewId", params: { reviewId: props.reviewId } });
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <FileX className="size-7 text-faint" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-heading">This file is no longer available</p>
        <p className="mx-auto max-w-xs text-[13px] text-muted-foreground">
          It was likely deleted or moved since this review was created.
        </p>
      </div>
      {props.kind === "file" && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void remove()}
          disabled={commands.removeFile.disabled}
        >
          <Trash2 aria-hidden />
          Remove from review
        </Button>
      )}
    </div>
  );
});

/**
 * Prompt for a deep link whose path is absent from the resolved file list (its
 * source was deleted or renamed under a directory selection, or the link is
 * stale). The review is intact, so a minimal header keeps the way out and the
 * panel offers to jump to the review's first file (in tree order); when the
 * review has no files at all, only the back-to-review action is shown.
 */
const MissingFilePrompt = observer(function MissingFilePrompt(props: {
  structure: ReviewStructure;
  path: string;
}) {
  const navigate = useNavigate();
  const reviewId = props.structure.review_id;
  const firstFile = orderedReviewFiles(props.structure.file_entries)[0];

  return (
    <main className="h-screen overflow-auto bg-canvas text-ink">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:px-4">
        <HomeButton />
        <span className="truncate text-sm font-medium text-heading">{props.structure.name}</span>
      </header>
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <FileX className="size-7 text-faint" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-heading">This file isn’t part of this review</p>
          <p className="mx-auto max-w-xs break-all font-mono text-[12px] text-muted-foreground">
            {props.path}
          </p>
        </div>
        {firstFile ? (
          <Button
            size="sm"
            onClick={() =>
              void navigate({
                to: "/reviews/$reviewId/files/$",
                params: reviewFileParams(reviewId, firstFile.path),
              })
            }
          >
            Open first file
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: "/reviews/$reviewId", params: { reviewId } })}
          >
            Back to review
          </Button>
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
