import { observer } from "mobx-react-lite"
import { useEffect, useState } from "react"
import { Check, Filter, Search } from "lucide-react"

import { Popover } from "../../components/ui/popover"
import { uiStore, type DiffWorktree } from "../../stores/ui-store"

/** BDR-0025 diff lens: a diff review is rendered against a live git tree.
 * The reviewer picks a **worktree** (branch-range diff, staged, or unstaged)
 * and, when in `diff` mode, an optional **commit subset** (multi-select). A
 * non-empty commit subset is mutually exclusive with staged/unstaged. */
export type ScopeCommit = { sha: string; subject: string }

const WORKTREE_OPTIONS: Array<{
  value: DiffWorktree
  label: string
  description: string
}> = [
  {
    value: "diff",
    label: "Diff",
    description: "The branch range base_ref…head_ref",
  },
  {
    value: "staged",
    label: "Staged",
    description: "Current index vs HEAD",
  },
  {
    value: "unstaged",
    label: "Unstaged",
    description: "Working tree vs the index",
  },
]

/** Reads the diff review's commit range via GET /api/review/:id/commits.
 * `[]` while idle/loading or on error — the popover renders with worktree
 * only in that case. */
export function useScopeCommits(reviewId: string, enabled: boolean): ScopeCommit[] {
  const [commits, setCommits] = useState<ScopeCommit[]>([])
  useEffect(() => {
    if (!enabled) {
      setCommits([])
      return
    }
    let cancelled = false
    fetch(`/api/review/${reviewId}/commits`)
      .then((response) => (response.ok ? response.json() : { commits: [] }))
      .then((body: { commits?: ScopeCommit[] }) => {
        if (!cancelled) setCommits(body.commits ?? [])
      })
      .catch(() => {
        if (!cancelled) setCommits([])
      })
    return () => {
      cancelled = true
    }
  }, [reviewId, enabled])
  return commits
}

/** Human label for the current lens — used as the popover trigger text and
 * the mobile sheet-tab caption. */
export function scopeLabel(commitCount: number): string {
  if (uiStore.diffWorktree === "staged") return "Staged"
  if (uiStore.diffWorktree === "unstaged") return "Unstaged"
  if (uiStore.diffScope === "all") {
    return commitCount > 0
      ? `All commits (${commitCount})`
      : "All commits"
  }
  const n = uiStore.diffScope.commits.length
  return `${n} commit${n === 1 ? "" : "s"}`
}

/** Shared popover body: worktree radio + commits multi-select. Reused by
 * both the desktop popover and the mobile Files/Scope sheet tab. */
export const ScopePickerBody = observer(function ScopePickerBody({
  commits,
}: {
  commits: ScopeCommit[]
}) {
  const worktree = uiStore.diffWorktree
  const isDiffMode = worktree === "diff"
  const selected = uiStore.diffScope === "all" ? new Set<string>() : new Set(uiStore.diffScope.commits)
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const shownCommits = needle
    ? commits.filter((c) => c.sha.includes(needle) || c.subject.toLowerCase().includes(needle))
    : commits
  return (
    <div className="flex min-h-0 flex-col">
      <fieldset className="border-b border-hair-strong px-2.5 py-2">
        <legend className="px-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
          Source
        </legend>
        <div className="flex flex-col gap-0.5">
          {WORKTREE_OPTIONS.map((option) => {
            const active = worktree === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => uiStore.setDiffWorktree(option.value)}
                className={`flex items-center gap-2 rounded-ctrl px-2 py-1.5 text-left ${
                  active ? "bg-accent-soft text-accent-bright" : "text-ink hover:bg-soft/60"
                }`}
              >
                <span
                  className={`grid size-[16px] shrink-0 place-items-center rounded-full border ${
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-hair-strong bg-canvas"
                  }`}
                  aria-hidden
                >
                  {active && <Check size={11} />}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold">{option.label}</span>
                  <span className="block text-[11.5px] text-muted">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {isDiffMode && commits.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Commits ({commits.length})
            </div>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => uiStore.setDiffScope("all")}
                className="text-[10.5px] font-medium text-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          {commits.length > 8 && (
            <div className="mx-2.5 mb-1 flex h-[26px] shrink-0 items-center gap-1.5 rounded-ctrl bg-canvas px-2 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
              <Search size={12} className="shrink-0 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter commits…"
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto px-1 pb-1.5">
            {shownCommits.map((commit) => {
              const checked = selected.has(commit.sha)
              return (
                <label
                  key={commit.sha}
                  className={`flex cursor-pointer items-start gap-2 rounded-ctrl px-2 py-1.5 hover:bg-soft/60 ${
                    checked ? "bg-soft/40" : ""
                  }`}
                >
                  <span
                    className={`mt-0.5 grid size-[15px] shrink-0 place-items-center rounded border ${
                      checked ? "border-accent bg-accent text-on-accent" : "border-hair-strong bg-canvas"
                    }`}
                    aria-hidden
                  >
                    {checked && <Check size={10} />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => uiStore.toggleDiffCommit(commit.sha)}
                  />
                  <code className="mt-px shrink-0 rounded bg-control px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums text-muted">
                    {commit.sha.slice(0, 7)}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={commit.subject}>
                    {commit.subject}
                  </span>
                </label>
              )
            })}
            {shownCommits.length === 0 && (
              <p className="px-2.5 py-3 text-center text-[11.5px] text-faint">No commits match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

/** Desktop scope trigger: a compact chip whose label reflects the current
 * lens; opens the popover with the shared body. */
export const ScopePopover = observer(function ScopePopover({
  commits,
}: {
  commits: ScopeCommit[]
}) {
  const label = scopeLabel(commits.length)
  return (
    <Popover
      align="end"
      className="w-[340px] p-0"
      render={
        <button
          type="button"
          className="inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-2 text-[11px] font-medium text-ink hover:bg-soft"
          title="Diff scope"
        >
          <Filter size={12} className="text-muted" aria-hidden />
          <span className="tabular-nums max-w-[160px] truncate">{label}</span>
        </button>
      }
    >
      <div className="max-h-[70vh] min-h-0">
        <ScopePickerBody commits={commits} />
      </div>
    </Popover>
  )
})
