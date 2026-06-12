import { makeAutoObservable } from "mobx"

import type { MarkdownFlavor } from "../markdown/render"
import { THEMES, type ThemeName } from "../themes"

export type DocView = "rendered" | "raw"
export type CommentMode = "inline" | "side"
export type StatusFilter = "all" | "unresolved" | "resolved"
export type CritiqueType = "fix_required" | "needs_answer" | "note"
export type CommentScope = "line" | "file" | "review"
export type Density = "tight" | "normal" | "loose"

const THEME_KEY = "suikou-theme"
const COMMENT_MODE_KEY = "suikou-comment-mode"
const DENSITY_KEY = "suikou-density"
const HIDE_COMMENTS_KEY = "suikou-hide-comments"
const WRAP_LINES_KEY = "suikou-wrap-lines"
const MARKDOWN_FLAVOR_KEY = "suikou-markdown-flavor"

/**
 * Ephemeral, client-only UI state for the review surface. Server-owned data
 * (artifacts, rounds, comments) lives in the Musubi ReviewStore; MobX holds only
 * transient interaction state — active theme, render/raw view, comment layout,
 * filters, and the in-progress comment composer draft.
 */
export class UiStore {
  theme: ThemeName = "github"
  commentMode: CommentMode = "side"
  density: Density = "normal"
  markdownFlavor: MarkdownFlavor = "gfm"
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

  selStart: number | null = null
  selEnd: number | null = null
  composerScope: CommentScope = "line"
  composerType: CritiqueType = "note"
  composerBody = ""

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

    if (localStorage.getItem(MARKDOWN_FLAVOR_KEY) === "plain") {
      this.markdownFlavor = "plain"
    }

    if (localStorage.getItem(WRAP_LINES_KEY) === "false") {
      this.wrapLines = false
    }

    if (localStorage.getItem(HIDE_COMMENTS_KEY) === "true") {
      this.hideComments = true
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

  openComposer(start: number | null, end: number | null, scope: CommentScope): void {
    this.selStart = start
    this.selEnd = end
    this.composerScope = scope
    this.composerType = "note"
    this.composerBody = ""
  }

  // Grow the active selection to cover [start, end], keeping the lowest start and
  // highest end so shift-clicking any line above or below extends the range.
  extendSelection(start: number, end: number): void {
    if (this.selStart === null || this.selEnd === null) {
      this.selStart = start
      this.selEnd = end
      return
    }
    this.selStart = Math.min(this.selStart, start)
    this.selEnd = Math.max(this.selEnd, end)
  }

  closeComposer(): void {
    this.selStart = null
    this.selEnd = null
    this.composerBody = ""
  }

  setComposerType(type: CritiqueType): void {
    this.composerType = type
  }

  setComposerBody(body: string): void {
    this.composerBody = body
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme
  }
}

export const uiStore = new UiStore()
