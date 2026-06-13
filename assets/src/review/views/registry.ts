import type { ComponentType } from "react"

import type { ReviewView } from "../store-context"
import type { ViewKind } from "../view-kind"
import { DiffView } from "./DiffView"
import { FileView } from "./FileView"
import { HtmlView } from "./HtmlView"

/** Props every registered view receives. */
export interface ViewProps {
  view: ReviewView
  /** Set by the `/raw` child route to force the source view for file artifacts. */
  forceRaw: boolean
  /** True when the side-rail layout is not used and anchored comments render inline. */
  inline: boolean
}

export type ViewComponent = ComponentType<ViewProps>

/** Single source of truth for which component renders each view kind. */
const VIEWS: Record<ViewKind, ViewComponent> = {
  file: FileView,
  diff: DiffView,
  html: HtmlView
}

/** Look up the view component for a resolved kind. */
export function viewComponentFor(kind: ViewKind): ViewComponent {
  return VIEWS[kind]
}
