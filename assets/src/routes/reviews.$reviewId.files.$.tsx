import { createFileRoute } from "@tanstack/react-router";

import { ArtifactReviewShell } from "../review/ArtifactReviewShell";
import { ErrorPage } from "@/components/error-page";

export const Route = createFileRoute("/reviews/$reviewId/files/$")({
  component: ReviewFileRoute,
});

function ReviewFileRoute() {
  const { reviewId, _splat } = Route.useParams();
  if (!_splat) {
    return (
      <ErrorPage
        label="Missing path"
        title="No file path"
        body="The URL is missing the file path segment."
      />
    );
  }
  return <ArtifactReviewShell reviewId={reviewId} path={_splat} />;
}
