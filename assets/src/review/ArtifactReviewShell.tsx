import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";
import { AlertTriangle, ArrowRight, Check, FileX, GitBranch, Lock, RotateCw, Trash2 } from "lucide-react";

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi";
import { uiStore } from "../stores/ui-store";
import { useMarkdown } from "../markdown/use-markdown";
import { contentErrorFrom, useContent, useReviewFileContent } from "./use-content";
import { useRawHighlight } from "./use-raw-highlight";
import { useDiskStale } from "./use-disk-stale";
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
import { HeaderSlotProvider } from "./header-slot";
import { useReviewCommands } from "./commands";
import { CommentRail } from "./CommentRail";
import { Navigator } from "./Navigator";
import { StatusBar, type ReviewOutcome } from "./StatusBar";
import { useScrollRestore } from "./use-scroll-restore";
import { HtmlAnchorComposer } from "./views/HtmlAnchorComposer";
import { isPreviewable, isImagePath } from "./file-type";
import { orderedReviewFiles } from "./file-order";
import { reviewFileParams } from "./review-navigation";
import { isHtmlPath } from "./view-kind";
import { HomeButton, ReviewBreadcrumb } from "./TopBarShell";
import {
  formatMovedTitle,
  refsBranchDeleted,
  refsMoved,
  shortSha,
  vanishedSide,
  type DiffRefs,
} from "./diff-refs";
import { assetBase } from "./urls";
import { resnapshotSummary } from "./resnapshot-summary";
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
      <ReviewStructureGate path={path} reviewId={reviewId} />
    </ReviewStoreProvider>
  );
}

/** Loads the review's static structure from the command before rendering the
 * shell, so chrome, file list, and navigation render from component state
 * (disconnect-proof) rather than the live snapshot. */
function ReviewStructureGate(props: { path: string; reviewId: string }) {
  const reviewStore = useReviewStore();
  // The live snapshot bumps `structure_version` whenever the file list reshapes;
  // feeding it to the hook refetches the structure so a newly opened/removed file
  // appears without a reload.
  const reviewSnapshot = useMusubiSnapshot(reviewStore);
  const { structure, error } = useLoadReviewStructure(
    reviewStore,
    props.reviewId,
    reviewSnapshot?.body?.structure_version,
  );

  if (error !== null) return <ErrorPage {...errorCopy(error)} />;
  if (structure === null) return <ReviewShellSkeleton label="Loading review…" />;
  // No review carries this id (vs. a real review that happens to have no files):
  // surface "review not found", not the per-file missing-file prompt.
  if (structure.exists === false) return <ErrorPage {...errorCopy("review_not_found")} />;

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
  const liveRow =
    fileIndex >= 0
      ? { fileSnapshot: live![fileIndex], fileProxy: reviewStore.body.files[fileIndex] }
      : null;

  const knownPath = structure.file_entries.some((e) => e.path === props.path);

  // A reconnect re-mounts the root with a whole-root `replace` patch, so
  // `body.files` reads empty for a frame and the row vanishes — the same
  // transient AllFilesView already guards against. Without a guard the file
  // subtree unmounts to a skeleton and rebuilds: a visible reload-like flash
  // (the file content, served from the HTTP/SWR cache, blanks and re-tokenizes).
  // Hold the last-good row (only while the path is still a real file) so the
  // content keeps rendering; the live row wins again the instant it returns.
  const held = useRef<{ path: string; row: NonNullable<typeof liveRow> } | null>(null);
  if (liveRow) {
    held.current = { path: props.path, row: liveRow };
  } else if (held.current && (held.current.path !== props.path || !knownPath)) {
    held.current = null;
  }
  const row = liveRow ?? (held.current?.path === props.path ? held.current.row : null);

  if (!row) {
    // No live row and nothing held: a genuine miss. Once the structure has
    // settled and the path is absent from it (deleted/renamed under a directory
    // selection, or a stale link), prompt the user to jump to a real file;
    // otherwise we are still on the very first hydrate, so show the skeleton.
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
      <FileStoreProvider store={row.fileProxy}>
        <HydratedReviewShell
          path={props.path}
          reviewSnapshot={reviewSnapshot as ReviewSnapshot}
          fallbackSnapshot={row.fileSnapshot}
        />
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
  fallbackSnapshot: NonNullable<FileSnapshotLive>;
}) {
  // The file store node reads undefined for a frame mid-reconnect; fall back to
  // the last-good row ReviewShell held so the body stays mounted instead of
  // flashing a skeleton. The live snapshot takes over again once it is back.
  const fileSnapshotLive = useFileSnapshot() ?? props.fallbackSnapshot;

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
  const sourceView = search.view === "source";

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

  const etag = contentState.etag;
  const blocks = useMarkdown(
    previewable ? content : "",
    ui.markdownFlavor,
    {
      base: minted ? assetBase(snapshot.artifact.id) : "",
      dir: slash === -1 ? "" : title.slice(0, slash),
    },
    etag,
  );
  const rawLines = useRawHighlight(content, title, etag);
  const { stale, refresh } = useDiskStale(snapshot.disk_version, etag, contentState.refetch);
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
    view: sourceView ? "source" : "rendered",
    ready: !loading,
    enabled: true,
  });

  // Genuinely gone: an untouched row whose source is missing at head (no blob
  // hash). A present-but-unminted file still has a hash and renders normally.
  // The review chrome stays; only the content body reports the missing file.
  const missing = !minted && snapshot.content_hash === null;

  const selectedRound = reviewSnapshot.body.selected_round ?? reviewSnapshot.body.latest_round ?? 0;
  const latestRound = reviewSnapshot.body.latest_round ?? 0;
  const readOnly = latestRound > 0 && selectedRound < latestRound;

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <TopBar reviewSnapshot={reviewSnapshot} previewable={previewable} content={content} />
      <div className="flex min-h-0 flex-1">
        <Navigator
          reviewSnapshot={reviewSnapshot}
          currentPath={snapshot.path}
          sourceView={sourceView}
        />
        <main ref={setMainEl} className="min-w-0 flex-1 overflow-auto">
          <div
            className={`mx-auto grid w-full max-w-[1760px] gap-4 px-3 pt-3 sm:gap-6 sm:px-5 lg:px-6 ${
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
                  etag,
                  blocks: blocks.blocks,
                  loading,
                  comments,
                  previewable,
                  rawLines,
                  verdict,
                  onVerdictChange: changeVerdict,
                  readOnly,
                }}
              >
                <HeaderSlotProvider>
                  {structure.refs && <RefsBanner refs={structure.refs} />}
                  <ResnapshotBanner
                    structure={structure}
                    reviewSnapshot={reviewSnapshot}
                    latestRound={latestRound}
                    selectedRound={selectedRound}
                  />
                  <ReviewOutcomeBanner
                    reviewSnapshot={reviewSnapshot}
                    structure={structure}
                    latestRound={latestRound}
                    selectedRound={selectedRound}
                  />
                  <article className="overflow-hidden rounded-xl border border-line bg-editor">
                    <FileHeader
                      sourceView={sourceView}
                      content={content}
                      verdict={verdict}
                      onVerdictChange={changeVerdict}
                      stale={stale}
                      onRefresh={refresh}
                    />
                    {readOnly && (
                      <ReadOnlyRoundStrip
                        selected={selectedRound}
                        latest={latestRound}
                      />
                    )}
                    {missing ? (
                      <MissingFilePanel
                        reviewId={structure.review_id}
                        path={snapshot.path}
                        kind={structure.kind}
                      />
                    ) : readOnly ? (
                      <div className="pointer-events-none select-none opacity-[0.92]" aria-hidden="false">
                        <Outlet />
                      </div>
                    ) : (
                      <Outlet />
                    )}
                  </article>
                </HeaderSlotProvider>
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
      </div>
      <StatusBar
        path={snapshot.path}
        viewLabel={statusBarViewLabel(reviewKind, sourceView, ui.diffLayout, wide)}
        round={selectedRound}
        roundStatus={
          readOnly
            ? "superseded"
            : selectedRound === 0 && latestRound === 0
            ? "draft"
            : null
        }
        outcome={reviewOutcome(reviewSnapshot, structure)}
        driftedAnchors={
          selectedRound === latestRound && latestRound > 0
            ? resnapshotSummary(structure, reviewSnapshot.body.files).driftedAnchors
            : 0
        }
      />
    </div>
  );
});

/** Strip that sits above the editor body when the viewer is on a superseded
 * round (A6): a lock glyph plus one line explaining that authoring only lands
 * on the latest round. Neutral tone — a lock, not a warning. */
function ReadOnlyRoundStrip(props: { selected: number; latest: number }) {
  return (
    <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-line-strong bg-soft px-3 py-2 text-[12px] text-muted-foreground">
      <Lock className="size-3.5 shrink-0 text-faint" aria-hidden />
      <span>
        Round {props.selected} is superseded and read-only. You can read its comments,
        but new comments and verdicts can only go on Round {props.latest}.
      </span>
    </div>
  );
}

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
  const crumbKind = props.structure.kind === "diff" ? "git_diff" : "file_selection";

  return (
    <main className="h-screen overflow-auto bg-canvas text-ink">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-10">
        <HomeButton />
        <ReviewBreadcrumb
          kind={crumbKind}
          name={props.structure.name}
          refs={props.structure.refs}
        />
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

/** Post-resnapshot rollup (A10): summarises how many files' bytes shifted since
 * the round was minted and how many published anchors drifted. Only renders on
 * the latest round (a superseded round is frozen, so drift there is expected
 * and reads as noise) and only when at least one signal is non-zero. */
function ResnapshotBanner(props: {
  structure: ReviewStructure;
  reviewSnapshot: ReviewSnapshot;
  latestRound: number;
  selectedRound: number;
}) {
  const { structure, reviewSnapshot, latestRound, selectedRound } = props;
  if (selectedRound !== latestRound || latestRound === 0) return null;
  const { filesChanged, driftedAnchors } = resnapshotSummary(
    structure,
    reviewSnapshot.body.files,
  );
  if (filesChanged === 0 && driftedAnchors === 0) return null;
  const priorRound = Math.max(latestRound - 1, 0);
  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-3 rounded-xl border border-accent-edge bg-accent-softer px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-text2 shadow-[inset_0_0.5px_0_var(--edge-top-2)]"
    >
      <span
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-accent-soft shadow-[inset_0_0.5px_0_var(--edge-top-2)]"
      >
        <RotateCw size={16} className="text-accent-bright" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="font-[660] text-heading">Resnapshotted to Round {latestRound}.</b>{" "}
        {filesChanged > 0 && (
          <>
            {filesChanged} {filesChanged === 1 ? "file" : "files"} changed since Round{" "}
            {priorRound}.{" "}
          </>
        )}
        {driftedAnchors > 0 && (
          <>
            {driftedAnchors} comment{" "}
            {driftedAnchors === 1 ? "anchor" : "anchors"} drifted and{" "}
            {driftedAnchors === 1 ? "needs" : "need"} re-anchoring; verdicts reset to
            draft.
          </>
        )}
        {driftedAnchors > 0 && (
          <div className="mt-1.5">
            <span className="inline-flex h-[19px] items-center gap-1.5 rounded-full bg-amber-soft px-2 text-[10.5px] font-[700] text-amber shadow-[inset_0_0_0_0.5px_var(--amber-edge)]">
              <AlertTriangle size={11} strokeWidth={2} aria-hidden />
              {driftedAnchors} anchor {driftedAnchors === 1 ? "recalculated" : "recalculated"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Terminal-state banner above the editor when the whole review is approved
 * on the latest round (A8). Only renders on the latest round — reading a
 * superseded round should not claim the review is approved. The banner carries
 * a `Dismiss approval` action (G6): clears the currently-viewed file's
 * approved_round, which removes it from the review's approved set so this
 * banner clears and the reviewer can iterate. Approval is per-artifact, so a
 * single dismiss reopens the review; submitting a later round auto-clears
 * remaining approvals via the normal submit path. */
const ReviewOutcomeBanner = observer(function ReviewOutcomeBanner(props: {
  reviewSnapshot: ReviewSnapshot;
  structure: ReviewStructure;
  latestRound: number;
  selectedRound: number;
}) {
  const { reviewSnapshot, structure, latestRound, selectedRound } = props;
  const commands = useReviewCommands();
  if (selectedRound !== latestRound) return null;
  if (reviewOutcome(reviewSnapshot, structure) !== "approved") return null;
  const activePaths = new Set(
    structure.file_entries.filter((e) => !e.soft_removed).map((e) => e.path),
  );
  const files = reviewSnapshot.body.files.filter((f) => activePaths.has(f.path));
  const total = files.length;
  const blockers = files.reduce(
    (acc, f) =>
      acc +
      (f.comments?.items ?? []).filter(
        (c) => c.critique_type === "fix_required" && (c.status === "pending" || !c.resolved),
      ).length,
    0,
  );
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-3 rounded-xl border border-green/30 bg-green-soft px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-text2 shadow-[inset_0_0.5px_0_var(--edge-top-2)]"
    >
      <span
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-green/20 shadow-[inset_0_0.5px_0_var(--edge-top-2)]"
      >
        <Check size={16} className="text-green" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="font-[660] text-heading">Review approved.</b>{" "}
        All {total} {total === 1 ? "file" : "files"} reviewed,{" "}
        {blockers === 0
          ? "no open blockers"
          : `${blockers} open ${blockers === 1 ? "blocker" : "blockers"}`}{" "}
        on Round {latestRound}. Approval is the terminal state, but reversible.
      </div>
      <button
        type="button"
        onClick={() => void commands.dismissApproval.dispatch({})}
        disabled={commands.dismissApproval.disabled}
        title="Reopen the review by clearing this file's approval; submitting a later round also auto-clears."
        className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[9px] bg-surface/80 px-2.5 font-[560] text-[11.5px] text-heading ring-1 ring-inset ring-line-strong shadow-[inset_0_0.5px_0_var(--edge-top-2)] transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-60"
      >
        <RotateCw size={12} className="text-muted-foreground" />
        Dismiss approval
      </button>
    </div>
  );
});

/** Roll the review's per-file `latest_verdict` up to a single review-level
 * outcome for the status bar (A8/A9). Any file with a published request_changes
 * puts the whole review in "changes requested"; a review whose files are all
 * published as approve is "approved". A file with no published verdict yet
 * (or `comment`) leaves the review's outcome unset — the reviewer is still
 * working on it. */
function reviewOutcome(
  reviewSnapshot: ReviewSnapshot,
  structure: ReviewStructure,
): ReviewOutcome | null {
  const activeEntries = structure.file_entries.filter((e) => !e.soft_removed);
  const activePaths = new Set(activeEntries.map((e) => e.path));
  const files = reviewSnapshot.body.files.filter((f) => activePaths.has(f.path));
  if (files.length === 0) return null;
  for (const f of files) {
    if (f.latest_verdict === "request_changes") return "changes_requested";
  }
  // "Approved" reads `approved_round` (structure's `approved` flag), not the
  // last submitted verdict — dismissing an approval clears `approved_round`
  // while the submission's `verdict: :approve` row remains, so keying off
  // `latest_verdict` would let a dismissed banner linger.
  const approvedCount = activeEntries.filter((e) => e.approved).length;
  return approvedCount === activeEntries.length ? "approved" : null;
}

/** Status bar's middle label: for a git_diff review, spell out Unified/Split diff
 * (matching the mockup); otherwise fall back to the source/preview axis. */
function statusBarViewLabel(
  reviewKind: "file" | "diff",
  sourceView: boolean,
  diffLayout: "unified" | "side",
  wide: boolean,
): string {
  if (reviewKind === "diff") {
    const layout = diffLayout === "side" && wide ? "Split" : "Unified"
    return `${layout} diff`
  }
  return sourceView ? "Source" : "Preview"
}

/** Above-file warning banner for a git_diff review whose refs shifted or
 * vanished after creation. The "refs moved" variant offers a Re-diff refs
 * action (not yet wired — deferred until the server-side re-diff flow lands);
 * the "branch deleted" variant is read-only, warning the diff is frozen. */
function RefsBanner({ refs }: { refs: DiffRefs }) {
  const moved = refsMoved(refs);
  const vanished = refsBranchDeleted(refs);
  if (!moved && !vanished) return null;

  if (vanished) {
    const side = vanishedSide(refs);
    const which = side === "both" ? "base and head" : side;
    const gone =
      side === "head"
        ? refs.head_ref
        : side === "base"
          ? refs.base_ref
          : `${refs.base_ref} and ${refs.head_ref}`;
    return (
      <div
        role="status"
        className="mb-3 flex items-center gap-2.5 rounded-lg border border-red/25 bg-red-soft px-3 py-2 text-[12px] text-text2"
      >
        <AlertTriangle size={16} className="shrink-0 text-red" aria-hidden />
        <div className="min-w-0 flex-1">
          The <b className="font-[620] text-heading">{which}</b> ref{" "}
          {gone && <code className="font-mono text-[11px] text-red">{gone}</code>}{" "}
          no longer exists. This diff is frozen at its last known state and
          cannot be re-diffed.
        </div>
      </div>
    );
  }

  const move = movedShas(refs);
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2.5 rounded-lg border border-amber/30 bg-amber-soft px-3.5 py-2 text-[12px] text-text2"
    >
      <GitBranch size={16} className="shrink-0 text-amber" aria-hidden />
      <div className="min-w-0 flex-1">
        <b className="font-[620] text-heading">{move.label} moved</b> since this
        review was created
        {move.from && move.to && (
          <>
            :{" "}
            <code className="font-mono text-[11px] text-amber" title={formatMovedTitle(refs)}>
              {move.from}
            </code>{" "}
            to{" "}
            <code className="font-mono text-[11px] text-amber" title={formatMovedTitle(refs)}>
              {move.to}
            </code>
          </>
        )}
        . The diff below is stale.
      </div>
      {/* ponytail: banner action is decorative — a real "Re-diff refs" flow
          needs a server-side command and round semantics; add when that lands. */}
      <span
        className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md bg-amber/15 px-2.5 text-[11.5px] font-[620] text-amber ring-1 ring-inset ring-amber/30"
        aria-hidden
      >
        <RotateCw size={13} aria-hidden />
        Re-diff refs
      </span>
    </div>
  );
}

function movedShas(refs: DiffRefs): { label: string; from: string | null; to: string | null } {
  const baseChanged =
    refs.base_sha && refs.creation_base_sha && refs.base_sha !== refs.creation_base_sha;
  const headChanged =
    refs.head_sha && refs.creation_head_sha && refs.head_sha !== refs.creation_head_sha;
  if (headChanged && !baseChanged) {
    return { label: "head", from: shortSha(refs.creation_head_sha), to: shortSha(refs.head_sha) };
  }
  if (baseChanged && !headChanged) {
    return { label: "base", from: shortSha(refs.creation_base_sha), to: shortSha(refs.base_sha) };
  }
  return { label: "refs", from: null, to: null };
}

