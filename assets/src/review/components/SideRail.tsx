import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { MessageSquare, MessageSquarePlus } from "lucide-react"

import { uiStore, type MonoSize } from "../../stores/ui-store"
import { SideCommentCard } from "./comments/SideCommentCard"
import { compactCritiqueLabel, type Comment, type CommentsStoreProxy } from "./comments/shared"

type HighlightRange = { start: number; end: number } | null
type RailGroup = { key: string; line: number | null; comments: Comment[] }

const MONO_PX: Record<MonoSize, string> = { small: "11.5px", default: "12.5px", large: "14px" }

export function SideRail({
  comments,
  commentsProxy,
  storageKey,
  onHoverRange,
  onClearFocus,
  onFocus,
}: {
  comments: Comment[]
  commentsProxy: CommentsStoreProxy | null
  storageKey: string | null
  onHoverRange: (range: HighlightRange) => void
  onClearFocus: () => void
  onFocus: (comment: Comment) => void
}) {
  const railBodyRef = useRef<HTMLDivElement | null>(null)
  const [groupTops, setGroupTops] = useState<Map<string, number>>(() => new Map())
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null)
  const [pinnedGroupKey, setPinnedGroupKey] = useState<string | null>(() => (storageKey ? localStorage.getItem(storageKey) : null))
  const groups = useMemo<RailGroup[]>(() => {
    const located = comments
      .filter((comment) => comment.scope === "located" && comment.anchor?.type === "line_range")
      .sort((a, b) => commentSortKey(a) - commentSortKey(b))
    const artifacts = comments
      .filter((comment) => comment.scope === "artifact")
      .map((comment) => ({ key: `artifact:${comment.id}`, line: null, comments: [comment] }) satisfies RailGroup)
    const groupedLocated: RailGroup[] = []

    let current: { line: number; end: number; comments: Comment[] } | null = null
    for (const comment of located) {
      const anchor = comment.anchor
      if (!anchor || anchor.type !== "line_range") continue
      if (current && anchor.start_line <= current.end) {
        current.comments.push(comment)
        current.end = Math.max(current.end, anchor.end_line)
        continue
      }
      if (current) groupedLocated.push({ key: `line:${current.line}`, line: current.line, comments: current.comments })
      current = { line: anchor.start_line, end: anchor.end_line, comments: [comment] }
    }
    if (current) groupedLocated.push({ key: `line:${current.line}`, line: current.line, comments: current.comments })

    return [...groupedLocated, ...artifacts]
  }, [comments])

  useLayoutEffect(() => {
    setPinnedGroupKey(storageKey ? localStorage.getItem(storageKey) : null)
  }, [storageKey])

  useEffect(() => {
    if (storageKey === null) return
    if (pinnedGroupKey === null) {
      localStorage.removeItem(storageKey)
      return
    }
    localStorage.setItem(storageKey, pinnedGroupKey)
  }, [storageKey, pinnedGroupKey])

  useEffect(() => {
    if (pinnedGroupKey !== null && !groups.some((group) => group.key === pinnedGroupKey)) setPinnedGroupKey(null)
  }, [groups, pinnedGroupKey])

  const fallbackTopFor = (group: RailGroup) => {
    const line = group.line
    return line === null ? 8 : Math.max(8, (line - 1) * parseFloat(MONO_PX[uiStore.monoSize]) * 1.55 + 8)
  }
  const groupExpanded = (group: RailGroup) => pinnedGroupKey === group.key
  const groupPreviewing = (group: RailGroup) => hoveredGroupKey === group.key && pinnedGroupKey !== group.key
  const focusGroup = (group: RailGroup) => {
    const comment = group.comments[0]
    setPinnedGroupKey(group.key)
    setHoveredGroupKey(group.key)
    onHoverRange(group.line === null ? null : { start: group.line, end: group.line })
    onFocus(comment)
    scrollToCommentAnchor(comment)
  }
  const clearTransientHover = () => {
    if (pinnedGroupKey !== null) return
    setHoveredGroupKey(null)
    onHoverRange(null)
  }
  const heightForComment = (comment: Comment) => (comment.replies.length > 0 ? 150 : 116)
  const heightForGroup = (group: RailGroup) => {
    if (!groupExpanded(group)) return groupPreviewing(group) ? 64 : 38
    return group.comments.reduce((sum, comment) => sum + heightForComment(comment), 0) + (group.comments.length - 1) * 8
  }

  useLayoutEffect(() => {
    const rail = railBodyRef.current
    const editor = document.querySelector("[data-review-scroll]") as HTMLElement | null

    const measure = () => {
      const next = new Map<string, number>()
      const locatedGroups = groups.filter((group) => group.line !== null)
      const artifactGroups = groups.filter((group) => group.line === null)

      const rawTopFor = (group: RailGroup) => {
        if (group.line === null) return fallbackTopFor(group)
        const lineEl = document.querySelector(`[data-review-line="${group.line}"]`) as HTMLElement | null
        return lineEl && editor
          ? lineEl.getBoundingClientRect().top - editor.getBoundingClientRect().top + editor.scrollTop
          : fallbackTopFor(group)
      }
      const measuredHeightFor = (group: RailGroup) => {
        const box = document.querySelector(`[data-side-group-id="${group.key}"]`) as HTMLElement | null
        return box?.getBoundingClientRect().height || heightForGroup(group)
      }

      const focusedIndex = pinnedGroupKey ? locatedGroups.findIndex((group) => group.key === pinnedGroupKey) : -1
      if (focusedIndex >= 0) {
        const focused = locatedGroups[focusedIndex]
        const focusedTop = Math.max(8, rawTopFor(focused))
        next.set(focused.key, focusedTop)

        let beforeBottom = focusedTop - 8
        for (let index = focusedIndex - 1; index >= 0; index -= 1) {
          const group = locatedGroups[index]
          const height = measuredHeightFor(group)
          const top = Math.max(8, Math.min(rawTopFor(group), beforeBottom - height))
          next.set(group.key, top)
          beforeBottom = top - 8
        }

        let afterTop = focusedTop + measuredHeightFor(focused) + 8
        for (let index = focusedIndex + 1; index < locatedGroups.length; index += 1) {
          const group = locatedGroups[index]
          const top = Math.max(rawTopFor(group), afterTop)
          next.set(group.key, top)
          afterTop = top + measuredHeightFor(group) + 8
        }
      } else {
        let nextLocatedTop = 8
        for (const group of locatedGroups) {
          const top = Math.max(8, rawTopFor(group), nextLocatedTop)
          next.set(group.key, top)
          nextLocatedTop = top + measuredHeightFor(group) + 8
        }
      }

      const locatedBottoms = locatedGroups.map((group) => (next.get(group.key) ?? fallbackTopFor(group)) + measuredHeightFor(group))
      let nextArtifactTop = Math.max(8, locatedBottoms.length ? Math.max(...locatedBottoms) + 8 : 8)
      for (const group of artifactGroups) {
        next.set(group.key, nextArtifactTop)
        nextArtifactTop += measuredHeightFor(group) + 8
      }

      if (rail && editor && rail.scrollTop !== editor.scrollTop) rail.scrollTop = editor.scrollTop
      setGroupTops(next)
    }

    measure()
    editor?.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    return () => {
      editor?.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
    }
  }, [groups, hoveredGroupKey, pinnedGroupKey])

  useEffect(() => {
    if (pinnedGroupKey === null) return
    const clearPinned = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const rail = railBodyRef.current
      if (rail?.contains(target)) return
      setPinnedGroupKey(null)
      setHoveredGroupKey(null)
      onHoverRange(null)
      onClearFocus()
    }
    window.addEventListener("pointerdown", clearPinned)
    return () => window.removeEventListener("pointerdown", clearPinned)
  }, [onClearFocus, onHoverRange, pinnedGroupKey])

  const railHeight =
    groups.length === 0
      ? "100%"
      : Math.max(...groups.map((group) => (groupTops.get(group.key) ?? fallbackTopFor(group)) + heightForGroup(group))) + 8

  return (
    <aside className="hidden min-h-0 flex-col border-l border-hair-strong bg-surface lg:flex">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-hair px-3" onPointerEnter={clearTransientHover}>
        <MessageSquare size={15} className="text-muted" aria-hidden />
        <h3 className="text-[12px] font-bold tracking-[-0.01em] text-ink">Comments</h3>
        <span className="rounded-full bg-soft px-2 py-0.5 text-[10.5px] font-bold text-muted tabular-nums">{comments.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => uiStore.setCommentDisplay("inline")}
          title="Switch to inline layout"
          className="grid size-[26px] place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
        >
          <MessageSquarePlus size={14} aria-hidden />
        </button>
      </div>
      <div
        ref={railBodyRef}
        className="min-h-0 flex-1 overflow-auto p-2"
        onPointerMove={(event) => {
          if (pinnedGroupKey !== null) return
          if ((event.target as Element).closest("[data-side-group-id]")) return
          clearTransientHover()
        }}
      >
        {groups.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-[12px] leading-[1.45] text-faint">No comments on this file.</div>
        ) : (
          <div className="relative min-h-full" style={{ minHeight: railHeight }}>
            {groups.map((group) => (
              <div
                key={group.key}
                data-side-group-id={group.key}
                style={{ top: groupTops.get(group.key) ?? fallbackTopFor(group) }}
                className={`absolute left-0 right-0 ${groupExpanded(group) ? "z-0" : "z-10"}`}
                onPointerDownCapture={(event) => {
                  if (groupExpanded(group)) return
                  if ((event.target as Element).closest("[data-side-group-summary]")) focusGroup(group)
                }}
                onPointerEnter={() => {
                  setHoveredGroupKey(group.key)
                  if (!groupExpanded(group)) onHoverRange(group.line === null ? null : { start: group.line, end: group.line })
                }}
                onPointerLeave={() => {
                  if (pinnedGroupKey !== group.key) setHoveredGroupKey((current) => (current === group.key ? null : current))
                  clearTransientHover()
                }}
              >
                {!groupExpanded(group) ? (
                  <SideGroupSummary group={group} preview={groupPreviewing(group)} onFocus={() => focusGroup(group)} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {group.comments.map((comment) => (
                      <SideCommentCard
                        key={comment.id}
                        comment={comment}
                        commentsProxy={commentsProxy}
                        onHover={() => onHoverRange(commentRange(comment))}
                        onLeave={() => onHoverRange(group.line === null ? null : { start: group.line, end: group.line })}
                        onFocus={() => scrollToCommentAnchor(comment)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function SideGroupSummary({
  group,
  preview,
  onFocus,
}: {
  group: RailGroup
  preview: boolean
  onFocus: () => void
}) {
  const first = group.comments[0]
  const line = group.line
  const count = group.comments.length
  const pendingCount = group.comments.filter((comment) => comment.status === "pending").length
  const typeLabels = [...new Set(group.comments.map((comment) => compactCritiqueLabel(comment.critique_type)))]

  return (
    <button
      type="button"
      data-side-group-summary
      onClick={onFocus}
      className="w-full overflow-hidden rounded-panel bg-canvas px-3 py-2 text-left shadow-sm ring-1 ring-inset ring-hair-strong hover:ring-accent-edge"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-soft px-2 text-[10px] font-bold normal-case text-muted">
          {count}
        </span>
        {line !== null && <span className="shrink-0 font-mono text-[11px] font-semibold text-muted">L{line}</span>}
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-faint">
          {typeLabels.join(" / ")}
          {pendingCount > 0 && <span className="size-1.5 shrink-0 rounded-full bg-amber" title="Pending" aria-label="Pending" />}
        </span>
        <span className={`min-w-0 flex-1 text-[12px] leading-[1.45] text-ink ${preview ? "line-clamp-2 whitespace-normal" : "truncate"}`}>
          {first.body}
        </span>
      </div>
    </button>
  )
}

function commentRange(comment: Comment | null): HighlightRange {
  return comment?.anchor?.type === "line_range"
    ? { start: comment.anchor.start_line, end: comment.anchor.end_line }
    : null
}

function commentSortKey(comment: Comment): number {
  if (comment.scope === "artifact") return 0
  if (comment.anchor?.type === "line_range") return comment.anchor.start_line
  return 1_000_000
}

function scrollToCommentAnchor(comment: Comment) {
  if (comment.anchor?.type !== "line_range") return
  document
    .querySelector(`[data-review-line="${comment.anchor.start_line}"]`)
    ?.scrollIntoView({ block: "center", behavior: "smooth" })
}
