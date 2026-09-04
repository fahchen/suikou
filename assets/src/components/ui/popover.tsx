import { Popover as BasePopover } from "@base-ui/react/popover"
import type { ReactElement, ReactNode } from "react"

import { POPUP_MOTION } from "./motion"

/** Themed popover over the Base UI Popover primitive: an anchored surface card
 * that stays open while its contents are interacted with (unlike a Menu). Wrap
 * the trigger with `render`; `children` is the panel body. Controlled via
 * `open`/`onOpenChange` so the caller can close it after an action. Pass `anchor`
 * (an element or a virtual element) instead of `render` to position against
 * something with no trigger, such as a rect reported from an iframe. */
export function Popover({
  render,
  anchor,
  collisionBoundary,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  chrome = true,
  className,
}: {
  render?: ReactElement
  anchor?: BasePopover.Positioner.Props["anchor"]
  collisionBoundary?: BasePopover.Positioner.Props["collisionBoundary"]
  children: ReactNode
  open?: boolean
  onOpenChange?: BasePopover.Root.Props["onOpenChange"]
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
      {render && <BasePopover.Trigger render={render} />}
      <BasePopover.Portal>
        <BasePopover.Positioner
          anchor={anchor}
          collisionBoundary={collisionBoundary}
          side={side}
          align={align}
          sideOffset={6}
          className="z-50 transition-opacity duration-100 data-[anchor-hidden]:pointer-events-none data-[anchor-hidden]:opacity-0"
        >
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
