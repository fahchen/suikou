import { makeAutoObservable } from "mobx"

import { THEMES, type ThemeName } from "../themes"

export type DocView = "rendered" | "raw"
export type CommentMode = "inline" | "side"
export type StatusFilter = "all" | "unresolved" | "resolved"
export type CritiqueType = "fix_required" | "needs_answer" | "note"
export type CommentScope = "line" | "file" | "review"

const THEME_KEY = "suikou-theme"

/**
 * Ephemeral, client-only UI state for the review surface. Server-owned data
 * (artifacts, rounds, comments) lives in the Musubi ReviewStore; MobX holds only
 * transient interaction state — active theme, render/raw view, comment layout,
 * filters, and the in-progress comment composer draft.
 */
export class UiStore {
  theme: ThemeName = "github"
  view: DocView = "rendered"
  commentMode: CommentMode = "side"
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

    const saved = localStorage.getItem(THEME_KEY)
    if (saved && (THEMES as readonly string[]).includes(saved)) {
      this.theme = saved as ThemeName
    }
    this.applyTheme()
  }

  setTheme(theme: ThemeName): void {
    this.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    this.applyTheme()
  }

  setView(view: DocView): void {
    this.view = view
  }

  setCommentMode(mode: CommentMode): void {
    this.commentMode = mode
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
