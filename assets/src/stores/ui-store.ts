import { makeAutoObservable } from "mobx"

import type { MarkdownFlavor } from "../markdown/render"
import { THEMES, type ThemeName } from "../themes"

export type DocView = "rendered" | "source"
export type CommentMode = "inline" | "side"
export type StatusFilter = "all" | "unresolved" | "resolved"
export type CritiqueType = "fix_required" | "needs_answer" | "note"
export type CommentScope = "review" | "artifact" | "located"
export type Density = "tight" | "normal" | "loose"
export type DiffLayout = "unified" | "side"
export type FileDisplayMode = "single" | "all"

/** A file's unsaved comment composer: its line anchor plus body/type/scope. */
export interface ComposerDraft {
  selStart: number | null
  selEnd: number | null
  scope: CommentScope
  type: CritiqueType
  body: string
}

const THEME_KEY = "suikou-theme"
const COMMENT_MODE_KEY = "suikou-comment-mode"
const DENSITY_KEY = "suikou-density"
const HIDE_COMMENTS_KEY = "suikou-hide-comments"
const WRAP_LINES_KEY = "suikou-wrap-lines"
const MARKDOWN_FLAVOR_KEY = "suikou-markdown-flavor"
const DIFF_LAYOUT_KEY = "suikou-diff-layout"
const FILE_DISPLAY_MODE_KEY = "suikou-file-display-mode"
const HIDE_REVIEWED_KEY = "suikou-hide-reviewed"
const COLLAPSED_FILES_KEY = "suikou-collapsed-files"
const DRAFTS_KEY = "suikou-drafts"

/**
 * Ephemeral, client-only UI state for the review surface. Server-owned data
 * (artifacts, rounds, comments) lives in the Musubi ReviewStore; MobX holds only
 * transient interaction state — active theme, render/source view, comment layout,
 * filters, and the in-progress comment composer draft.
 */
export class UiStore {
  theme: ThemeName = "github"
  commentMode: CommentMode = "side"
  density: Density = "normal"
  markdownFlavor: MarkdownFlavor = "gfm"
  diffLayout: DiffLayout = "side"
  fileDisplayMode: FileDisplayMode = "single"
  // All-files mode: hide rows whose per-file verdict is already set. Off by
  // default so the reviewer sees every file on first open; flipping it on
  // collapses the stack to outstanding work.
  hideReviewed = false
  wrapLines = true
  hideComments = false
  commentsCollapsed = false
  collapseNonce = 0
  // Session-only: comment ids added after the page loaded. Under hide-all these
  // stay visible so you can see what you just wrote; never persisted, so a
  // refresh clears it and every comment falls back under the hide-all rule.
  revealedCommentIds: string[] = []
  statusFilter: StatusFilter = "all"
  typeFilters: Record<CritiqueType, boolean> = {
    fix_required: true,
    needs_answer: true,
    note: true
  }

  // In-progress comment drafts, one per file path. A draft is the unsaved
  // composer for a file: its anchor selection plus body/type/scope. Keying by
  // path means switching files never loses or bleeds a draft — the destination
  // file's own draft is restored, and the file you left keeps its text. An
  // entry is removed only on successful submit or an explicit cancel. The
  // legacy single-file scope (`null`) maps to the empty-string key.
  drafts: Record<string, ComposerDraft> = {}

  // Persisted draft store namespaced by reviewId, so a refresh / socket drop
  // never loses an in-progress comment and the legacy single-file scope ("")
  // can't bleed across reviews. `drafts` mirrors the current review's slice;
  // `setReviewScope` swaps it in when a review mounts.
  private draftsByReview: Record<string, Record<string, ComposerDraft>> = {}
  private currentReviewId: string | null = null

  // Visible mint-on-click affordance: the path currently being minted into
  // an artifact by an `open_file` command. Survives the navigation that
  // tears down the current ReviewShell, so the progress strip in the
  // mounted shell stays visible until the new shell takes over.
  mintingPath: string | null = null

  // Per-file render-vs-source override in all-files (stacked) mode. Keyed by file
  // path so each stacked card owns its display independently of the others;
  // unset means the file falls back to its default (rendered). Transient
  // session state — not persisted.
  fileSourceView: Record<string, boolean> = {}

  // Per-file collapse state in all-files (stacked) mode, keyed by review then
  // path. Persisted so a reviewer's collapsed files survive reload. Only
  // explicit collapses are stored; an absent entry means expanded, so a file
  // new to the stack defaults open.
  collapsedFiles: Record<string, Record<string, boolean>> = {}

  // Client-computed outdated state for element-anchored comments. The server
  // never relocates element anchors (Plan B: re-anchoring is client-only), so
  // HtmlView resolves them against the live iframe DOM and publishes the
  // misses here. Scoped to element anchors so the file/diff views are
  // unaffected; CommentCard reads it through `isCommentOutdated/1`.
  outdatedElementCommentIds: Set<string> = new Set()

  // Element the reviewer has targeted in the rendered HTML iframe. Inline mode
  // anchors a floating popover here; side mode hands this off to the rail so
  // the rail composer focuses on the same element. Scoped by artifactId so a
  // stale target from a previous HTML artifact doesn't leak through.
  htmlAnchorTarget: { artifactId: string; selector: string; quote: string } | null = null

  // Rendered-HTML interaction mode. Comment (default): hover + click anchor a
  // comment, and clicks are intercepted. Interactive: listeners are off so the
  // live (scripted) document handles its own pointer events. Session-only.
  htmlInteractive = false

  constructor() {
    makeAutoObservable(this)

    const savedTheme = localStorage.getItem(THEME_KEY)
    if (savedTheme && (THEMES as readonly string[]).includes(savedTheme)) {
      this.theme = savedTheme as ThemeName
    }

    const savedCommentMode = localStorage.getItem(COMMENT_MODE_KEY)
    if (savedCommentMode === "inline" || savedCommentMode === "side") {
      this.commentMode = savedCommentMode
    }

    const savedDensity = localStorage.getItem(DENSITY_KEY)
    if (savedDensity === "tight" || savedDensity === "normal" || savedDensity === "loose") {
      this.density = savedDensity
    }

    if (localStorage.getItem(MARKDOWN_FLAVOR_KEY) === "commonmark") {
      this.markdownFlavor = "commonmark"
    }

    const savedDiffLayout = localStorage.getItem(DIFF_LAYOUT_KEY)
    if (savedDiffLayout === "unified" || savedDiffLayout === "side") {
      this.diffLayout = savedDiffLayout
    }

    const savedFileDisplayMode = localStorage.getItem(FILE_DISPLAY_MODE_KEY)
    if (savedFileDisplayMode === "single" || savedFileDisplayMode === "all") {
      this.fileDisplayMode = savedFileDisplayMode
    }

    if (localStorage.getItem(WRAP_LINES_KEY) === "false") {
      this.wrapLines = false
    }

    if (localStorage.getItem(HIDE_COMMENTS_KEY) === "true") {
      this.hideComments = true
    }

    if (localStorage.getItem(HIDE_REVIEWED_KEY) === "true") {
      this.hideReviewed = true
    }

    const savedCollapsed = localStorage.getItem(COLLAPSED_FILES_KEY)
    if (savedCollapsed) {
      try {
        this.collapsedFiles = JSON.parse(savedCollapsed)
      } catch {
        // Corrupt JSON: ignore and start from an empty collapse map.
      }
    }

    const savedDrafts = localStorage.getItem(DRAFTS_KEY)
    if (savedDrafts) {
      try {
        this.draftsByReview = JSON.parse(savedDrafts)
      } catch {
        // Corrupt JSON: ignore and start from no persisted drafts.
      }
    }

    this.applyTheme()
  }

  setTheme(theme: ThemeName): void {
    this.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    this.applyTheme()
  }

  setCommentMode(mode: CommentMode): void {
    this.commentMode = mode
    localStorage.setItem(COMMENT_MODE_KEY, mode)
  }

  setDensity(density: Density): void {
    this.density = density
    localStorage.setItem(DENSITY_KEY, density)
  }

  setMarkdownFlavor(flavor: MarkdownFlavor): void {
    this.markdownFlavor = flavor
    localStorage.setItem(MARKDOWN_FLAVOR_KEY, flavor)
  }

  setDiffLayout(layout: DiffLayout): void {
    this.diffLayout = layout
    localStorage.setItem(DIFF_LAYOUT_KEY, layout)
  }

  setFileDisplayMode(mode: FileDisplayMode): void {
    this.fileDisplayMode = mode
    localStorage.setItem(FILE_DISPLAY_MODE_KEY, mode)
  }

  setWrapLines(wrap: boolean): void {
    this.wrapLines = wrap
    localStorage.setItem(WRAP_LINES_KEY, String(wrap))
  }

  setHideComments(hide: boolean): void {
    this.hideComments = hide
    localStorage.setItem(HIDE_COMMENTS_KEY, String(hide))
    // Hiding starts from a clean slate; only comments added afterward reveal.
    if (hide) this.revealedCommentIds = []
  }

  setHideReviewed(hide: boolean): void {
    this.hideReviewed = hide
    localStorage.setItem(HIDE_REVIEWED_KEY, String(hide))
  }

  revealComment(id: string): void {
    if (!this.revealedCommentIds.includes(id)) this.revealedCommentIds.push(id)
  }

  toggleCollapseAll(): void {
    this.commentsCollapsed = !this.commentsCollapsed
    this.collapseNonce++
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter
  }

  toggleType(type: CritiqueType): void {
    this.typeFilters[type] = !this.typeFilters[type]
  }

  // Point the live `drafts` map at a review's persisted slice. Called when a
  // review mounts so its in-progress drafts are restored, and later edits
  // persist under the right review.
  setReviewScope(reviewId: string): void {
    if (reviewId === this.currentReviewId) return
    this.currentReviewId = reviewId
    this.drafts = this.draftsByReview[reviewId] ?? {}
  }

  // The unsaved draft for a file, or undefined when the file has none open.
  draftFor(filePath: string | null): ComposerDraft | undefined {
    return this.drafts[filePath ?? ""]
  }

  openComposer(
    start: number | null,
    end: number | null,
    scope: CommentScope,
    filePath: string | null = null
  ): void {
    this.putDraft(filePath, { selStart: start, selEnd: end, scope, type: "note", body: "" })
  }

  // Grow a file's draft selection to cover [start, end], keeping the lowest
  // start and highest end so shift-clicking any line above or below extends the
  // range. Each file's draft is independent, so extending only touches its own.
  extendSelection(start: number, end: number, filePath: string | null = null): void {
    const draft = this.draftFor(filePath)
    if (!draft || draft.selStart === null || draft.selEnd === null) {
      this.putDraft(filePath, {
        selStart: start,
        selEnd: end,
        scope: draft?.scope ?? "located",
        type: draft?.type ?? "note",
        body: draft?.body ?? ""
      })
      return
    }
    this.putDraft(filePath, {
      ...draft,
      selStart: Math.min(draft.selStart, start),
      selEnd: Math.max(draft.selEnd, end)
    })
  }

  closeComposer(filePath: string | null = null): void {
    const key = filePath ?? ""
    if (!(key in this.drafts)) return
    const next = { ...this.drafts }
    delete next[key]
    this.drafts = next
    this.persistDrafts()
  }

  setComposerType(type: CritiqueType, filePath: string | null = null): void {
    this.putDraft(filePath, { ...this.blankDraft(filePath), type })
  }

  setComposerBody(body: string, filePath: string | null = null): void {
    this.putDraft(filePath, { ...this.blankDraft(filePath), body })
  }

  setMintingPath(path: string | null): void {
    this.mintingPath = path
  }

  setFileSourceView(path: string, source: boolean): void {
    this.fileSourceView = { ...this.fileSourceView, [path]: source }
  }

  getFileSourceView(path: string): boolean {
    return this.fileSourceView[path] ?? false
  }

  setFileCollapsed(reviewId: string, path: string, collapsed: boolean): void {
    const forReview = { ...(this.collapsedFiles[reviewId] ?? {}) }
    if (collapsed) forReview[path] = true
    else delete forReview[path]
    this.collapsedFiles = { ...this.collapsedFiles, [reviewId]: forReview }
    localStorage.setItem(COLLAPSED_FILES_KEY, JSON.stringify(this.collapsedFiles))
  }

  isFileCollapsed(reviewId: string, path: string): boolean {
    return this.collapsedFiles[reviewId]?.[path] ?? false
  }

  // Replace the set in one shot so observers see a single change. Identity-
  // equal sets short-circuit to avoid spurious renders when nothing moved.
  setOutdatedElementCommentIds(ids: Set<string>): void {
    if (sameSet(this.outdatedElementCommentIds, ids)) return
    this.outdatedElementCommentIds = ids
  }

  setHtmlAnchorTarget(
    target: { artifactId: string; selector: string; quote: string } | null
  ): void {
    this.htmlAnchorTarget = target
  }

  setHtmlInteractive(interactive: boolean): void {
    this.htmlInteractive = interactive
  }

  private putDraft(filePath: string | null, draft: ComposerDraft): void {
    this.drafts = { ...this.drafts, [filePath ?? ""]: draft }
    this.persistDrafts()
  }

  // Write the current review's draft slice back to localStorage. No-op until a
  // review scope is set (e.g. the project board has no drafts).
  private persistDrafts(): void {
    if (this.currentReviewId === null) return
    this.draftsByReview = { ...this.draftsByReview, [this.currentReviewId]: this.drafts }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(this.draftsByReview))
  }

  // The current draft for a file, or an empty one so a body/type edit can land
  // even before a selection is opened (e.g. a test seeding text directly).
  private blankDraft(filePath: string | null): ComposerDraft {
    return (
      this.draftFor(filePath) ?? {
        selStart: null,
        selEnd: null,
        scope: "located",
        type: "note",
        body: ""
      }
    )
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

export const uiStore = new UiStore()
