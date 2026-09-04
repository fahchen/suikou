import { Dialog as BaseDialog } from "@base-ui/react/dialog"
import { useRef, type ReactNode } from "react"

import { BACKDROP_MOTION, DIALOG_MOTION } from "./motion"

/** Themed modal over the Base UI Dialog primitive: a dimmed backdrop and a
 * surface popup that is a bottom sheet on phones and a centered card from `sm`.
 * Base UI handles focus trapping, scroll lock, and Escape; `onClose` fires on
 * any dismissal (Escape or backdrop). Size the popup via `className`.
 *
 * Focus lands on the popup itself rather than on the first field. Opening a
 * dialog is not the same as wanting to type in it: a stolen caret hides the
 * placeholder, and on a phone it throws the keyboard up over the content you
 * opened the dialog to read. Tab still reaches every control in order. */
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
  const popupRef = useRef<HTMLDivElement | null>(null)

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
          ref={popupRef}
          initialFocus={popupRef}
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full flex-col border border-hair-strong bg-surface shadow-[0_20px_60px_oklch(0%_0_0/0.4)] outline-none rounded-t-[22px] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] ${DIALOG_MOTION} ${className ?? ""}`}
        >
          {/* Bottom-sheet drag grip — phones only; the desktop centred card has none. */}
          <span className="mx-auto mt-[9px] mb-1 h-[5px] w-[38px] shrink-0 rounded-full bg-control sm:hidden" aria-hidden />
          {children}
          {/* Phone safe area as a spacer, not padding: a `pb-*` here would beat
              the caller's own padding in the cascade and flatten it to nothing. */}
          <span className="h-[env(safe-area-inset-bottom)] shrink-0 sm:hidden" aria-hidden />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

/** The dialog's accessible title. Renders an `<h2>`; pass `className` to style. */
export const DialogTitle = BaseDialog.Title
