import type { ComponentProps } from "react"

/** Themed multi-line input: a hairline field on the canvas that takes the accent
 * edge on focus. Sizing and rows stay with the call site; the look does not. */
export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={`block w-full resize-none rounded-ctrl border border-hair-strong bg-canvas px-2.5 py-2 text-xs leading-[1.5] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none ${className}`}
      {...props}
    />
  )
}
