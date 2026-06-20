import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { observer } from "mobx-react-lite";

import { storeCache, useMusubiRoot, useMusubiSnapshot } from "../musubi";
import { ReviewShellSkeleton } from "../review/ArtifactReviewShell";
import { Centered } from "../components/centered";
import { ErrorPage, errorCopy } from "../components/error-page";
import { reviewFileTarget } from "../review/review-navigation";

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

  return <ReviewLandingResolver reviewId={reviewId} store={root.store} />;
}

const ReviewLandingResolver = observer(function ReviewLandingResolver(props: {
  reviewId: string;
  store: import("@musubi/react").StoreProxy<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>;
}) {
  const navigate = useNavigate();
  const snapshot = useMusubiSnapshot(props.store);
  const entries = snapshot.file_entries.data;

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    const first = entries[0];
    void navigate({
      ...reviewFileTarget(props.reviewId, first.path, false),
      replace: true,
    });
  }, [entries]);

  if (snapshot.file_entries.status === "loading") {
    return <ReviewShellSkeleton label="Loading review…" />;
  }

  if (!entries || entries.length === 0) {
    return (
      <Centered>
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <strong className="text-heading">No files in this review</strong>
          <span className="text-muted-foreground">
            This review does not currently cover any files.
          </span>
        </div>
      </Centered>
    );
  }

  return <ReviewShellSkeleton label="Loading review…" />;
});
