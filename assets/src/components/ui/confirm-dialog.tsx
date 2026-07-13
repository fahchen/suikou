import { Dialog, DialogTitle } from "./dialog"

/** A small confirm/cancel dialog. `destructive` tints the confirm button with
 * the request colour for irreversible actions (delete, discard). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = true,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} className="gap-3 p-5 sm:max-w-[400px]">
      <DialogTitle className="text-base font-bold text-ink">{title}</DialogTitle>
      <p className="text-xs leading-[1.5] text-muted">{body}</p>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="inline-flex h-[32px] items-center rounded-ctrl px-3 text-sm font-medium text-muted hover:bg-soft"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`inline-flex h-[32px] items-center rounded-ctrl px-4 text-sm font-semibold text-on-accent hover:brightness-110 ${
            destructive ? "bg-request" : "bg-accent"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
