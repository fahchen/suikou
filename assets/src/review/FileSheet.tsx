import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useNavigate } from "@tanstack/react-router"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Folder, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { NavFilter, NavigatorList } from "./Navigator"
import { reviewFileTarget } from "./review-navigation"
import { useNavigatorModel } from "./use-navigator-model"
import { useReviewStructure } from "./use-review-structure"
import type { ReviewFileEntry, ReviewSnapshot } from "./types"

/** Mobile file navigator as a bottom sheet (mockup state M-N1). On phone the
 * navigator is not a permanent column; it slides up over a scrim from a trigger
 * in the app bar. Reuses the desktop Navigator's row/model (`useNavigatorModel`
 * + `NavigatorList`) in touch mode so both surfaces show the same grouped files,
 * counts, verdict icons, and soft-removed rows. Selecting a file navigates and
 * closes the sheet. */
export const FileSheet = observer(function FileSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reviewSnapshot: ReviewSnapshot
  currentPath: string | null
  sourceView: boolean
}) {
  const { open, onOpenChange, reviewSnapshot, currentPath, sourceView } = props
  const structure = useReviewStructure()
  const navigate = useNavigate()
  const [filter, setFilter] = useState("")
  const model = useNavigatorModel(reviewSnapshot, filter)
  const query = filter.trim()

  function onSelect(entry: ReviewFileEntry) {
    void navigate(reviewFileTarget(structure.review_id, entry.path, sourceView))
    onOpenChange(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-canvas/50 duration-150",
            "supports-backdrop-filter:backdrop-blur-[2px]",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          aria-label="Files in this review"
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col overflow-hidden",
            "rounded-t-[22px] border-t border-line-strong bg-panel",
            "shadow-[0_-2px_10px_var(--elev-overlay,rgba(0,0,0,0.4))]",
            "outline-none duration-200",
            "data-open:animate-in data-open:slide-in-from-bottom-4 data-open:fade-in-0",
            "data-closed:animate-out data-closed:slide-out-to-bottom-4 data-closed:fade-out-0",
          )}
        >
          <span
            aria-hidden
            className="mx-auto mt-[9px] mb-[4px] h-[5px] w-[38px] shrink-0 rounded-full bg-hover"
          />
          <div className="flex shrink-0 items-center gap-[9px] px-[14px] pt-[6px] pb-[11px]">
            <Folder size={17} className="shrink-0 text-muted-foreground" aria-hidden />
            <DialogPrimitive.Title className="text-[15px] font-[700] tracking-[-0.015em] text-heading">
              Files
            </DialogPrimitive.Title>
            <span className="flex-1" />
            <span className="inline-flex items-center gap-[5px] text-[12px] font-[600] text-muted-foreground tabular-nums">
              <span className="text-green">{model.reviewedCount}</span>
              {" / "}
              {model.total} reviewed
            </span>
            <DialogPrimitive.Close
              aria-label="Close files"
              className="grid size-[32px] shrink-0 place-items-center rounded-full bg-hover text-muted-foreground shadow-[inset_0_0_0_0.5px_var(--line-strong)] transition-colors hover:text-heading"
            >
              <X size={16} aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-auto px-[10px] pb-[18px]">
            <NavFilter
              touch
              value={filter}
              onChange={setFilter}
              onClear={() => setFilter("")}
            />
            <NavigatorList
              model={model}
              currentPath={currentPath}
              onSelect={onSelect}
              filter={query}
              touch
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})
