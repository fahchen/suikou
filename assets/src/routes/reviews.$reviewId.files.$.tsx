import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";
import { ArrowLeft, FileQuestion, FileText, FileX2 } from "lucide-react";
import type { StoreProxy } from "@musubi/react";

import { storeCache, useMusubiCommand, useMusubiRoot, useMusubiSnapshot } from "../musubi";
import { ArtifactReviewShell, ReviewShellSkeleton } from "../review/ArtifactReviewShell";
import { reviewFileParams } from "../review/review-navigation";
import { uiStore } from "../stores/ui-store";
import { ErrorPage, errorCopy } from "@/components/error-page";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/reviews/$reviewId/files/$")({
  component: ReviewFileRoute,
});

function ReviewFileRoute() {
  const root = useMusubiRoot({
    module: "SuikouWeb.Stores.ProjectBoardStore",
    id: "board",
    params: {},
    cache: storeCache,
  });

  if (root.status === "loading") return <ReviewShellSkeleton label="Opening file…" />;
  if (root.status === "error") return <ErrorPage {...errorCopy(root.error.message)} />;

  return <ResolvedReviewFileRoute store={root.store} />;
}

function ResolvedReviewFileRoute(props: {
  store: StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>;
}) {
  const { reviewId, _splat } = Route.useParams();
  const path = _splat ?? null;
  const openReviewFile = useMusubiCommand(props.store, "open_review_file");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; artifactId: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      setState({ status: "error", message: "Missing file path" });
      return;
    }

    setState({ status: "loading" });
    uiStore.setMintingPath(path);
    void openReviewFile
      .dispatch({ review_id: reviewId, path })
      .then((reply) => {
        if (cancelled) return;
        if (!reply.artifact_id) {
          uiStore.setMintingPath(null);
          setState({ status: "error", message: reply.error ?? "Could not open file" });
          return;
        }
        setState({ status: "ready", artifactId: reply.artifact_id });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        uiStore.setMintingPath(null);
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not open file",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [path, reviewId]);

  if (state.status === "loading") {
    return <ReviewShellSkeleton label={`Opening ${path}…`} />;
  }
  if (state.status === "error") {
    return (
      <FileOpenError store={props.store} reviewId={reviewId} path={path} message={state.message} />
    );
  }
  return <ArtifactReviewShell artifactId={state.artifactId} />;
}

/**
 * Shown when a deep link points at a file the review doesn't cover — usually a
 * stale link after the file was renamed or dropped from the set. Beyond
 * explaining the failure, it lists the review's actual files so the reviewer
 * can jump straight to a valid one instead of bouncing to the board.
 */
const FileOpenError = observer(function FileOpenError(props: {
  store: StoreProxy<"SuikouWeb.Stores.ProjectBoardStore", Musubi.Stores>;
  reviewId: string;
  path: string | null;
  message: string;
}) {
  const snapshot = useMusubiSnapshot(props.store);
  const notCovered = props.message === "not_covered";
  const files =
    snapshot.review_files.data?.find((e) => e.review_id === props.reviewId)?.files ?? [];
  const alternatives = files.filter((f) => f.path !== props.path);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 text-ink">
      <div className="flex w-full min-w-0 max-w-md animate-in flex-col items-center gap-5 text-center fade-in slide-in-from-bottom-2 duration-500">
        <span className="grid size-14 place-items-center rounded-full bg-soft text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]">
          {notCovered ? (
            <FileQuestion className="size-6" strokeWidth={1.75} aria-hidden />
          ) : (
            <FileX2 className="size-6" strokeWidth={1.75} aria-hidden />
          )}
        </span>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-[0.22em] text-faint uppercase">
            {notCovered ? "Not in review" : "Couldn’t open"}
          </p>
          <h1 className="text-lg font-semibold text-heading">
            {notCovered ? "This file isn’t part of the review" : "We couldn’t open this file"}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {notCovered
              ? "It may have been renamed or removed from the review’s file set."
              : props.message}
          </p>
        </div>

        {props.path && (
          <code className="max-w-full truncate rounded-lg bg-code px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {props.path}
          </code>
        )}

        {alternatives.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 text-left">
            <p className="px-1 text-xs font-medium text-faint">Files in this review</p>
            <ul className="flex max-h-64 flex-col overflow-auto rounded-lg border border-line">
              {alternatives.map((file) => (
                <li key={file.path}>
                  <Link
                    to="/reviews/$reviewId/files/$"
                    params={reviewFileParams(props.reviewId, file.path)}
                    className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] text-ink last:border-b-0 hover:bg-soft"
                  >
                    <FileText className="size-3.5 shrink-0 text-faint" aria-hidden />
                    <span className="truncate">{file.path}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link to="/" className={buttonVariants({ variant: "pill", size: "sm" })}>
          <ArrowLeft aria-hidden />
          Back to board
        </Link>
      </div>
    </div>
  );
});
