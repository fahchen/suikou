import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

import type { CommandReply } from "@musubi/react"

import { useMusubiCommand, useSocketConnected } from "../musubi"
import type { ChangeStatus } from "./ChangeStatusIcon"
import { readCommandCache, writeCommandCache } from "./command-cache"
import type { FileSnapshot, ReviewStore } from "./types"

function structureCacheKey(reviewId: string): string {
  return `suikou-structure:${reviewId}`
}

/**
 * The review's static structure, fetched once via the `load_review_structure`
 * request-response command and held in component state — never subscribed from
 * the live snapshot. Carries the chrome (name/kind), the file list, and each
 * file's content identity (artifact id/title, content hashes). The live snapshot
 * keeps only what must stream in real time: comments, counters, and verdicts.
 */
export type ReviewStructure = CommandReply<
  "SuikouWeb.Stores.ReviewStore",
  "load_review_structure",
  Musubi.Stores
>
export type StructureFile = ReviewStructure["files"][number]
export type StructureFileEntry = ReviewStructure["file_entries"][number]

export interface ReviewStructureState {
  structure: ReviewStructure | null
  loading: boolean
  error: string | null
}

/**
 * Loads the review structure from the store and refetches it on mount and on
 * every socket reconnect. No cache layer: the component holds the single result.
 * `structureVersion` is an optional trigger — when the live snapshot bumps it
 * (a file minted/removed or a new round), pass the new value to refetch.
 */
export function useLoadReviewStructure(
  store: ReviewStore,
  reviewId: string,
  structureVersion?: number
): ReviewStructureState {
  const loadStructure = useMusubiCommand(store, "load_review_structure")
  const connected = useSocketConnected()
  // Seed from the last-good cached structure so a forced reload paints the real
  // file list on the first frame; the command below revalidates it (SWR). Keyed
  // by reviewId so each review keeps its own entry (the root store id is empty).
  const cacheKey = structureCacheKey(reviewId)
  const [structure, setStructure] = useState<ReviewStructure | null>(() =>
    readCommandCache<ReviewStructure>(cacheKey)
  )
  const [error, setError] = useState<string | null>(null)

  // Latest structure, read inside the retry closure without re-arming the effect.
  const structureRef = useRef<ReviewStructure | null>(null)
  structureRef.current = structure

  // Fetch on mount and whenever the socket reconnects or the structure version
  // bumps. The phoenix socket reopens a beat before the musubi channel re-joins,
  // so an eager dispatch on reconnect rejects with "Store is not connected".
  // Retry through that window and keep the last-good structure on screen; only
  // surface a hard error on the very first load, after several failed tries.
  useEffect(() => {
    if (!connected) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0

    const attempt = () => {
      loadStructure
        .dispatch({})
        .then((reply) => {
          if (cancelled) return
          setStructure(reply)
          writeCommandCache(cacheKey, reply)
          setError(null)
        })
        .catch((cause: Error) => {
          if (cancelled) return
          attempts += 1
          // Nothing to show yet and it keeps failing — a real error, surface it.
          if (structureRef.current === null && attempts >= 5) {
            setError(cause.message)
            return
          }
          timer = setTimeout(attempt, 400)
        })
    }

    attempt()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, structureVersion])

  return { structure, loading: structure === null && error === null, error }
}

const ReviewStructureContext = createContext<ReviewStructure | null>(null)

export function ReviewStructureProvider(props: { structure: ReviewStructure; children: ReactNode }) {
  return (
    <ReviewStructureContext.Provider value={props.structure}>
      {props.children}
    </ReviewStructureContext.Provider>
  )
}

export function useReviewStructure(): ReviewStructure {
  const structure = useContext(ReviewStructureContext)
  if (!structure) {
    throw new Error("useReviewStructure must be used within a ReviewStructureProvider")
  }
  return structure
}

/** The static identity row for a path, or undefined when the path is unknown. */
export function structureFile(
  structure: ReviewStructure,
  path: string
): StructureFile | undefined {
  return structure.files.find((f) => f.path === path)
}

export function structureEntry(
  structure: ReviewStructure,
  path: string
): StructureFileEntry | undefined {
  return structure.file_entries.find((e) => e.path === path)
}

/**
 * The per-file view the renderers consume: the live snapshot's real-time fields
 * (comments, verdicts, viewed round) plus the static identity overlaid from the
 * structure command (artifact, content hashes, change status). The live snapshot
 * no longer carries the static fields, so this is their single source.
 */
export interface MergedFileView {
  path: string
  artifact_id: string | null
  content_hash: string | null
  change_status: ChangeStatus
  artifact: { id: string; title: string; approved: boolean; approved_round: number | null }
  current_round: FileSnapshot["current_round"]
  comments: FileSnapshot["comments"]
  latest_verdict: FileSnapshot["latest_verdict"]
  draft_verdict: FileSnapshot["draft_verdict"]
}

/**
 * Overlays a file's static structure identity onto its live snapshot, joining on
 * `path`. Static fields come from the command result; comments, verdicts, and
 * the viewed round come from the live snapshot.
 */
export function mergeFileView(
  live: FileSnapshot,
  file: StructureFile | undefined,
  entry: StructureFileEntry | undefined
): MergedFileView {
  const title = file?.artifact?.title ?? file?.path ?? live.path
  return {
    // Identity comes from the structure (keyed by the route path), not the live
    // snapshot: the live store node can lag a beat behind a client-side file
    // switch, and trusting `live.path` would fetch the previous file's source.
    path: file?.path ?? entry?.path ?? live.path,
    artifact_id: file?.artifact_id ?? null,
    content_hash: file?.content_hash ?? null,
    change_status: entry?.change_status ?? null,
    artifact: {
      id: file?.artifact?.id ?? "",
      title,
      approved: false,
      approved_round: null,
    },
    current_round: {
      ...live.current_round,
      content_hash: file?.current_round?.content_hash ?? live.current_round.content_hash,
    },
    comments: live.comments,
    latest_verdict: live.latest_verdict,
    draft_verdict: live.draft_verdict,
  }
}
