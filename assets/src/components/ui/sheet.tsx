import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { BACKDROP_MOTION } from "./motion"

/** Themed edge drawer over the Base UI Dialog primitive: slides in over the
 * page from the left edge, dimming what it covers. Base UI handles focus
 * trapping, scroll lock, and dismissal by Escape or a tap on the backdrop. */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetContent({
  className,
  children,
  ...props
}: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className={`fixed inset-0 z-50 bg-[oklch(0%_0_0/0.32)] ${BACKDROP_MOTION}`}
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[300px] max-w-[85vw] flex-col border-r border-hair-strong bg-surface shadow-[0_20px_60px_oklch(0%_0_0/0.3)] outline-none transition-[translate,opacity] duration-200 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full data-[ending-style]:duration-150",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-sm font-bold text-ink", className)}
      {...props}
    />
  )
}

export { Sheet, SheetContent, SheetTitle }
