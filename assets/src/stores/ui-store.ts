import { makeAutoObservable } from "mobx"

import { errorLogStore } from "./error-log-store"
import { THEMES, type ThemeName } from "../themes"

export type Density = "compact" | "comfortable" | "loose"
export type MonoSize = "small" | "default" | "large" | "xlarge"
/** Mono font-size tiers, aligned to the Tailwind text scale so code and diff
 * surfaces size identically per tier (small=12px, default=16px, large=18px,
 * xlarge=20px). */
export const MONO_SIZE: Record<MonoSize, string> = { small: "text-xs", default: "text-base", large: "text-lg", xlarge: "text-xl" }
/** Same tiers in px, for layout math that can't read the rendered font-size. */
export const MONO_PX: Record<MonoSize, number> = { small: 12, default: 16, large: 18, xlarge: 20 }
export type CommentDisplayMode = "inline" | "side" | "hidden"
export type FileRange = "single" | "stacked"
export type DiffStyle = "unified" | "split"
/** Diff review live-lens state (BDR-0025): the reviewer's current commit
 * scope and working-tree source. Both default to the branch-range diff.
 * Reset by ReviewPage on review change. Commits are stored newest-first,
 * matching the order the `/commits` endpoint returns. */
export type DiffScope = "all" | { commits: string[] }
export type DiffWorktree = "diff" | "staged" | "unstaged"

const THEME_KEY = "suikou-theme"
const DENSITY_KEY = "suikou-density"
const MONO_KEY = "suikou-mono-size"
const WRAP_KEY = "suikou-code-wrap"
const COMMENT_DISPLAY_KEY = "suikou-comment-display"
const FILE_RANGE_KEY = "suikou-file-range"
const DIFF_STYLE_KEY = "suikou-diff-style"
const WORD_DIFF_KEY = "suikou-word-diff"
const USER_EMOJI_KEY = "suikou-user-emoji"
const ERROR_LOG_KEY = "suikou-error-log"

/** App-wide UI preferences (theme, reading density, code wrap) plus the
 * settings modal's open flag. Persisted to localStorage and applied to the
 * document root so a reload restores the chosen surface. */
class UiStore {
  theme: ThemeName = "suikou-dark"
  density: Density = "comfortable"
  monoSize: MonoSize = "default"
  codeWrap = false
  commentDisplay: CommentDisplayMode = "inline"
  fileRange: FileRange = "single"
  diffStyle: DiffStyle = "unified"
  wordDiff = true
  userEmoji = ""
  errorLog = false
  diffScope: DiffScope = "all"
  diffWorktree: DiffWorktree = "diff"
  settingsOpen = false

  constructor() {
    makeAutoObservable(this)
    this.loadPersisted()
  }

  setTheme(theme: ThemeName) {
    this.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    this.applyTheme()
  }

  setDensity(density: Density) {
    this.density = density
    localStorage.setItem(DENSITY_KEY, density)
  }

  setMonoSize(size: MonoSize) {
    this.monoSize = size
    localStorage.setItem(MONO_KEY, size)
  }

  setCodeWrap(wrap: boolean) {
    this.codeWrap = wrap
    localStorage.setItem(WRAP_KEY, wrap ? "1" : "0")
  }

  setCommentDisplay(mode: CommentDisplayMode) {
    this.commentDisplay = mode
    localStorage.setItem(COMMENT_DISPLAY_KEY, mode)
  }

  setFileRange(range: FileRange) {
    this.fileRange = range
    localStorage.setItem(FILE_RANGE_KEY, range)
  }

  setDiffStyle(style: DiffStyle) {
    this.diffStyle = style
    localStorage.setItem(DIFF_STYLE_KEY, style)
  }

  setWordDiff(on: boolean) {
    this.wordDiff = on
    localStorage.setItem(WORD_DIFF_KEY, on ? "1" : "0")
  }

  setUserEmoji(emoji: string) {
    // Keep only the first grapheme so the avatar slot always holds one glyph.
    this.userEmoji = [...emoji.trim()][0] ?? ""
    if (this.userEmoji) localStorage.setItem(USER_EMOJI_KEY, this.userEmoji)
    else localStorage.removeItem(USER_EMOJI_KEY)
  }

  setErrorLog(on: boolean) {
    this.errorLog = on
    localStorage.setItem(ERROR_LOG_KEY, on ? "1" : "0")

    if (on) {
      errorLogStore.listen()
      return
    }

    // Stop before clearing: clearing alone would empty the list while the
    // listeners kept refilling it, invisibly, with the tab now hidden. Discard
    // what was collected too — keeping stack traces for a reader who asked to
    // stop recording them serves nobody.
    errorLogStore.stop()
    errorLogStore.clear()
  }

  setDiffScope(scope: DiffScope) {
    // Empty commit list normalizes to "all" — same rule the backend applies.
    if (scope !== "all" && scope.commits.length === 0) {
      this.diffScope = "all"
    } else {
      this.diffScope = scope
    }
    // BDR-0025: any concrete commits selection is mutually exclusive with
    // a staged/unstaged worktree; force the worktree back to diff.
    if (this.diffScope !== "all") this.diffWorktree = "diff"
  }

  toggleDiffCommit(sha: string) {
    const current = this.diffScope === "all" ? [] : this.diffScope.commits
    const next = current.includes(sha)
      ? current.filter((s) => s !== sha)
      : [...current, sha]
    this.setDiffScope(next.length === 0 ? "all" : { commits: next })
  }

  setDiffWorktree(worktree: DiffWorktree) {
    this.diffWorktree = worktree
    // Same rule from the other side: switching off :diff forces scope to :all.
    if (worktree !== "diff") this.diffScope = "all"
  }

  // Set both lens fields at once from an already-exclusive source (the URL),
  // bypassing the cross-forcing the individual setters apply.
  hydrateDiffLens(scope: DiffScope, worktree: DiffWorktree) {
    this.diffScope = scope
    this.diffWorktree = worktree
  }

  setSettingsOpen(open: boolean) {
    this.settingsOpen = open
  }

  private loadPersisted() {
    const theme = localStorage.getItem(THEME_KEY)
    if (theme && (THEMES as readonly string[]).includes(theme)) this.theme = theme as ThemeName
    const density = localStorage.getItem(DENSITY_KEY)
    if (density === "compact" || density === "comfortable" || density === "loose") {
      this.density = density
    }
    const mono = localStorage.getItem(MONO_KEY)
    if (mono === "small" || mono === "default" || mono === "large" || mono === "xlarge") this.monoSize = mono
    this.codeWrap = localStorage.getItem(WRAP_KEY) === "1"
    const commentDisplay = localStorage.getItem(COMMENT_DISPLAY_KEY)
    if (commentDisplay === "inline" || commentDisplay === "side" || commentDisplay === "hidden") {
      this.commentDisplay = commentDisplay
    }
    const fileRange = localStorage.getItem(FILE_RANGE_KEY)
    if (fileRange === "single" || fileRange === "stacked") this.fileRange = fileRange
    const diffStyle = localStorage.getItem(DIFF_STYLE_KEY)
    if (diffStyle === "unified" || diffStyle === "split") this.diffStyle = diffStyle
    this.wordDiff = localStorage.getItem(WORD_DIFF_KEY) !== "0"
    this.userEmoji = localStorage.getItem(USER_EMOJI_KEY) ?? ""
    this.errorLog = localStorage.getItem(ERROR_LOG_KEY) === "1"
    // Attach before first paint when it was already on, so an error thrown
    // during startup — the kind worth catching — is not missed.
    if (this.errorLog) errorLogStore.listen()
    this.applyTheme()
  }

  private applyTheme() {
    document.documentElement.dataset.theme = this.theme
    // Tint the iOS/Safari browser UI (status bar, bottom bar) to the app canvas
    // so it reads as one app surface, not a vermilion band. Read the resolved
    // rgb() off body — a computed colour is always valid in theme-color, unlike
    // the raw oklch() var. rAF so the new theme's cascade has settled.
    requestAnimationFrame(() => {
      const meta = document.querySelector('meta[name="theme-color"]')
      const bg = getComputedStyle(document.body).backgroundColor
      if (meta && bg) meta.setAttribute("content", bg)
    })
  }
}

export const uiStore = new UiStore()
