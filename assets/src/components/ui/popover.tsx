import { Popover as BasePopover } from "@base-ui/react/popover"
import type { ReactElement, ReactNode } from "react"

import { POPUP_MOTION } from "./motion"

/** Themed popover over the Base UI Popover primitive: an anchored surface card
 * that stays open while its contents are interacted with (unlike a Menu). Wrap
 * the trigger with `render`; `children` is the panel body. Controlled via
 * `open`/`onOpenChange` so the caller can close it after an action. */
export function Popover({
  render,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  chrome = true,
  className,
}: {
  render: ReactElement
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  chrome?: boolean
  className?: string
}) {
  const chromeClass = chrome
    ? "rounded-panel border border-hair-strong bg-surface p-[7px] shadow-[0_12px_30px_oklch(0%_0_0/0.3)]"
    : ""

  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={render} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={6} className="z-50">
          <BasePopover.Popup
            className={`${chromeClass} outline-none ${POPUP_MOTION} ${className ?? ""}`}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}
