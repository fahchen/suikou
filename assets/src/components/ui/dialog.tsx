import { Dialog as BaseDialog } from "@base-ui/react/dialog"
import type { ReactNode } from "react"

import { BACKDROP_MOTION, DIALOG_MOTION } from "./motion"

/** Themed modal over the Base UI Dialog primitive: a dimmed backdrop and a
 * surface popup that is a bottom sheet on phones and a centered card from `sm`.
 * Base UI handles focus trapping, scroll lock, and Escape; `onClose` fires on
 * any dismissal (Escape or backdrop). Size the popup via
 * `className`. */
export function Dialog({
  open,
  onClose,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={`fixed inset-0 z-50 bg-[oklch(0%_0_0/0.5)] backdrop-blur-[2px] ${BACKDROP_MOTION}`} />
        <BaseDialog.Popup
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full flex-col border border-hair-strong bg-surface shadow-[0_20px_60px_oklch(0%_0_0/0.4)] outline-none rounded-t-[22px] pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:pb-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] ${DIALOG_MOTION} ${className ?? ""}`}
        >
          {/* Bottom-sheet drag grip — phones only; the desktop centred card has none. */}
          <span className="mx-auto mt-[9px] mb-1 h-[5px] w-[38px] shrink-0 rounded-full bg-control sm:hidden" aria-hidden />
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

/** The dialog's accessible title. Renders an `<h2>`; pass `className` to style. */
export const DialogTitle = BaseDialog.Title
