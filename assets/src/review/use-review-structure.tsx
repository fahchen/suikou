import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import type { CommandReply } from "@musubi/react"

import { useMusubiCommand, useSocketConnected } from "../musubi"
import type { FileSnapshot, ReviewStore } from "./types"

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
  structureVersion?: number
): ReviewStructureState {
  const loadStructure = useMusubiCommand(store, "load_review_structure")
  const connected = useSocketConnected()
  const [structure, setStructure] = useState<ReviewStructure | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    loadStructure
      .dispatch({})
      .then((reply) => {
        setStructure(reply)
        setError(null)
      })
      .catch((cause: Error) => setError(cause.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A command dispatched mid-disconnect would reject, so only fetch while
  // connected; reconnecting flips `connected` back to true and refetches.
  useEffect(() => {
    if (connected) refetch()
  }, [connected, refetch, structureVersion])

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
 * Overlays a file's static structure identity onto its live snapshot, producing
 * the per-file view the renderers consume: static fields (artifact, content
 * hashes, change status) from the command result, live fields (comments,
 * verdicts, viewed round) from the snapshot. They join on `path`.
 */
export function mergeFileView(
  live: FileSnapshot,
  file: StructureFile | undefined,
  entry: StructureFileEntry | undefined
): FileSnapshot {
  const title = file?.artifact?.title ?? file?.path ?? live.path
  return {
    ...live,
    artifact_id: file?.artifact_id ?? null,
    content_hash: file?.content_hash ?? null,
    change_status: entry?.change_status ?? null,
    artifact: {
      id: file?.artifact?.id ?? "",
      title,
      approved: live.artifact?.approved ?? false,
      approved_round: live.artifact?.approved_round ?? null,
    },
    current_round: {
      ...live.current_round,
      content_hash: file?.current_round?.content_hash ?? live.current_round.content_hash,
    },
  }
}
