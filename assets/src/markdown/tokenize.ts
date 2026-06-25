import type { ThemedToken } from "shiki"

import type { TokenizeRequest } from "./highlight-worker"

interface WorkerReply {
  id: number
  tokens?: ThemedToken[][]
  error?: string
}

interface Pending {
  resolve: (tokens: ThemedToken[][]) => void
  reject: (reason: string) => void
}

const cache = new Map<string, ThemedToken[][]>()
const inflight = new Map<string, Promise<ThemedToken[][]>>()
const pending = new Map<number, Pending>()
let nextId = 0
let worker: Worker | null = null

/**
 * Builds `tokenize`'s cache key from the backend content hash, the resolved
 * Shiki theme name, and a per-view discriminator so the raw view and each
 * markdown fence cache independently. Centralized so producers can't drift.
 */
export const tokenKey = (etag: string, shikiTheme: string, extra: string) =>
  `${etag}|${shikiTheme}|${extra}`

/** Cached tokens for `cacheKey`, or undefined if not yet tokenized this session. */
export function peekTokens(cacheKey: string): ThemedToken[][] | undefined {
  return cache.get(cacheKey)
}

/**
 * Tokenizes `code` off the main thread via a lazily-spawned module worker and
 * memoizes the result by `cacheKey` (content hash + theme). Concurrent calls for
 * the same key share one in-flight promise so the worker tokenizes each
 * file/theme pair at most once; cache hits resolve synchronously.
 */
export function tokenize(
  code: string,
  lang: string,
  shikiTheme: string,
  cacheKey: string
): Promise<ThemedToken[][]> {
  const cached = cache.get(cacheKey)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(cacheKey)
  if (existing) return existing

  const id = nextId++
  const promise = new Promise<ThemedToken[][]>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const request: TokenizeRequest = { id, code, lang, theme: shikiTheme }
    ensureWorker().postMessage(request)
  })
    .then((tokens) => {
      cache.set(cacheKey, tokens)
      inflight.delete(cacheKey)
      return tokens
    })
    .catch((reason) => {
      inflight.delete(cacheKey)
      throw reason
    })

  inflight.set(cacheKey, promise)
  return promise
}

// Spawned on first tokenize, never at import, so importing render.ts in
// jsdom/vitest (which has no real Worker) doesn't construct one.
function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./highlight-worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const { id, tokens, error } = event.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (error !== undefined) entry.reject(error)
      else entry.resolve(tokens ?? [])
    }
  }
  return worker
}
