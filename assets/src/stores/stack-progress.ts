import { makeAutoObservable } from "mobx"

const storageKey = (reviewId: string): string => `suikou-stack-read:${reviewId}`

/** Reading progress through a review stack (BDR-0028): the steps the reviewer
 * has marked read, on this device only. Keyed by commit SHA, so a step
 * cherry-picked onto the stack starts unread and a re-cut stack starts over.
 * Persisted to localStorage under the review id. */
export class StackProgress {
  private readonly read: Set<string>

  constructor(private readonly reviewId: string) {
    this.read = new Set(loadRead(reviewId))
    makeAutoObservable<StackProgress, "reviewId">(this, { reviewId: false })
  }

  isRead(sha: string): boolean {
    return this.read.has(sha)
  }

  toggle(sha: string) {
    if (this.read.has(sha)) this.read.delete(sha)
    else this.read.add(sha)
    try {
      localStorage.setItem(storageKey(this.reviewId), JSON.stringify([...this.read]))
    } catch {
      // Best-effort: a full or denied localStorage must never block reading.
    }
  }

  /** The 1-based number of the first unread step among `shas` (oldest first);
   * step 1 when every step is read or there are none. */
  firstUnreadStep(shas: string[]): number {
    const index = shas.findIndex((sha) => !this.read.has(sha))
    return index === -1 ? 1 : index + 1
  }
}

function loadRead(reviewId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(reviewId)) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((sha): sha is string => typeof sha === "string") : []
  } catch {
    return []
  }
}
