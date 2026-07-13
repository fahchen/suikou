import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"
import type { ReactElement, ReactNode } from "react"

import { POPUP_MOTION } from "./motion"

/** Themed tooltip over the Base UI Tooltip primitive. Wrap the trigger element
 * with `render`; `content` is shown on hover or focus. */
export function Tooltip({
  render,
  content,
  side = "bottom",
}: {
  render: ReactElement
  content: ReactNode
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <BaseTooltip.Provider delay={150}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={render} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
            <BaseTooltip.Popup className={`max-w-[280px] rounded-ctrl border border-hair-strong bg-surface px-2.5 py-1.5 text-xs leading-[1.45] text-muted shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none ${POPUP_MOTION}`}>
              {content}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}
