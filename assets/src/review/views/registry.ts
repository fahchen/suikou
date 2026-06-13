import type { ComponentType } from "react"

import type { ReviewView } from "../store-context"
import type { ViewKind } from "../view-kind"
import { FileView } from "./FileView"

/** Props every registered view receives. */
export interface ViewProps {
  view: ReviewView
  /** Set by the `/raw` child route to force the source view for file artifacts. */
  forceRaw: boolean
  /** True when the side-rail layout is not used and anchored comments render inline. */
  inline: boolean
}

export type ViewComponent = ComponentType<ViewProps>

/**
 * Single source of truth for which component renders each view kind. The diff
 * and html kinds currently fall through to `FileView` (so the existing file
 * view is byte-identical for every artifact); Phase 11 swaps the `diff` entry
 * to a two-column diff view, Phase 12 swaps the `html` entry to a sandboxed
 * iframe view — each one a localized edit that does not touch `FileView` or
 * the routes.
 */
const VIEWS: Record<ViewKind, ViewComponent> = {
  file: FileView,
  diff: FileView,
  html: FileView
}

/** Look up the view component for a resolved kind. */
export function viewComponentFor(kind: ViewKind): ViewComponent {
  return VIEWS[kind]
}
