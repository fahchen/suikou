import type { ReactNode } from "react"

/** Labelled form row: a label, an optional hint under it, then the control.
 * One place for form rhythm, so dialogs stop restating label markup. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {hint && <span className="-mt-0.5 text-xs leading-[1.4] text-faint">{hint}</span>}
      {children}
    </label>
  )
}
