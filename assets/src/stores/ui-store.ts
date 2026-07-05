import { makeAutoObservable } from "mobx"

import { THEMES, type ThemeName } from "../themes"

export type Density = "compact" | "comfortable" | "loose"
export type MonoSize = "small" | "default" | "large"
export type CommentDisplayMode = "inline" | "side" | "hidden"

const THEME_KEY = "suikou-theme"
const DENSITY_KEY = "suikou-density"
const MONO_KEY = "suikou-mono-size"
const WRAP_KEY = "suikou-code-wrap"
const COMMENT_DISPLAY_KEY = "suikou-comment-display"

/** App-wide UI preferences (theme, reading density, code wrap) plus the
 * settings modal's open flag. Persisted to localStorage and applied to the
 * document root so a reload restores the chosen surface. */
class UiStore {
  theme: ThemeName = "suikou-dark"
  density: Density = "comfortable"
  monoSize: MonoSize = "default"
  codeWrap = false
  commentDisplay: CommentDisplayMode = "inline"
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
    if (mono === "small" || mono === "default" || mono === "large") this.monoSize = mono
    this.codeWrap = localStorage.getItem(WRAP_KEY) === "1"
    const commentDisplay = localStorage.getItem(COMMENT_DISPLAY_KEY)
    if (commentDisplay === "inline" || commentDisplay === "side" || commentDisplay === "hidden") {
      this.commentDisplay = commentDisplay
    }
    this.applyTheme()
  }

  private applyTheme() {
    document.documentElement.dataset.theme = this.theme
  }
}

export const uiStore = new UiStore()
