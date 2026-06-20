export function reviewFileParams(reviewId: string, path: string) {
  return { reviewId, _splat: path }
}

export function reviewFileTarget(reviewId: string, path: string, rawView: boolean) {
  return {
    to: "/reviews/$reviewId/files/$",
    params: reviewFileParams(reviewId, path),
    search: rawView ? { view: "raw" } : {}
  } as const
}
