export function reviewFileParams(reviewId: string, path: string) {
  return { reviewId, _splat: path }
}

export function reviewFileTarget(reviewId: string, path: string, sourceView: boolean) {
  return {
    to: "/reviews/$reviewId/files/$",
    params: reviewFileParams(reviewId, path),
    search: sourceView ? { view: "source" } : {}
  } as const
}
