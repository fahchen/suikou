import { makeAutoObservable } from "mobx"

export type LoggedError = {
  id: string
  at: number
  kind: "error" | "rejection" | "render"
  message: string
  source: string
  stack: string
}

const STORAGE_KEY = "suikou-error-log-entries"
// Enough to see a pattern, few enough that the tail of a loop cannot fill
// localStorage. Oldest entries fall off first.
const MAX_ENTRIES = 50

/** Errors collected while the reader has diagnostics switched on (Settings →
 * Errors). Kept in localStorage because the interesting ones tend to precede a
 * reload — an error that only lived in memory would be gone by the time anyone
 * went looking for it. Nothing leaves the browser. */
class ErrorLogStore {
  entries: LoggedError[] = []
  private listening = false
  // Ids only need to be unique among the entries alive at once. A counter gives
  // that; the obvious `${Date.now()}-${entries.length}` does not, because length
  // pins to the cap and two errors in one millisecond then collide.
  private nextId = 0

  constructor() {
    makeAutoObservable(this)
    this.entries = load()
    // Continue past what the last session persisted, or a fresh counter would
    // hand a new entry the id of one restored beside it.
    this.nextId = 1 + this.entries.reduce((top, e) => Math.max(top, Number(e.id) || 0), -1)
  }

  /** Starts recording. Idempotent, so the caller can mirror the preference
   * without tracking whether listeners are already attached. */
  listen() {
    if (this.listening || typeof window === "undefined") return
    this.listening = true

    window.addEventListener("error", this.onError)
    window.addEventListener("unhandledrejection", this.onRejection)
  }

  /** Stops recording. Without this the switch would only hide the log while the
   * listeners kept filling it — the reader having asked, in as many words, for
   * that to stop. */
  stop() {
    if (!this.listening) return
    this.listening = false

    window.removeEventListener("error", this.onError)
    window.removeEventListener("unhandledrejection", this.onRejection)
  }

  /** Records one error. Called by the window listeners and by the React error
   * boundary, which sees render failures the listeners never do. */
  record(entry: Omit<LoggedError, "id" | "at">) {
    // The single gate on whether collecting is on. Callers state what happened
    // and let this decide, rather than each testing the preference themselves.
    if (!this.listening) return

    // Collapse a repeat of the newest entry rather than paging out the history
    // behind it: a render loop otherwise evicts everything that led up to it.
    const newest = this.entries[0]
    if (newest && newest.message === entry.message && newest.stack === entry.stack) return

    this.entries = [
      { ...entry, id: String(this.nextId++), at: Date.now() },
      ...this.entries,
    ].slice(0, MAX_ENTRIES)
    save(this.entries)
  }

  clear() {
    this.entries = []
    save(this.entries)
  }

  private onError = (event: ErrorEvent) => {
    this.record({
      kind: "error",
      message: event.message || "Unknown error",
      source: [event.filename, event.lineno].filter(Boolean).join(":"),
      stack: event.error instanceof Error ? (event.error.stack ?? "") : "",
    })
  }

  private onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    this.record({
      kind: "rejection",
      message: reason instanceof Error ? reason.message : String(reason ?? "Unknown rejection"),
      source: "unhandled promise rejection",
      stack: reason instanceof Error ? (reason.stack ?? "") : "",
    })
  }
}

function load(): LoggedError[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt or unavailable storage is not worth failing a page load over.
    return []
  }
}

function save(entries: LoggedError[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota or private mode — the in-memory list still serves this session.
  }
}

export const errorLogStore = new ErrorLogStore()
