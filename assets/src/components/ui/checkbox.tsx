import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

/** Themed checkbox over the Base UI primitive: a hairline square that fills with
 * the accent, showing a check when on and a dash when indeterminate (a folder
 * with only some of its files selected). */
export function Checkbox({
  checked,
  indeterminate,
  onCheckedChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (checked: boolean) => void
  "aria-label"?: string
}) {
  const filled = checked || indeterminate
  return (
    <BaseCheckbox.Root
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={ariaLabel}
      className={`grid size-[16px] shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors ${
        filled ? "border-accent bg-accent text-on-accent" : "border-hair-strong bg-canvas"
      }`}
    >
      {filled &&
        (indeterminate ? (
          <Minus size={11} strokeWidth={3.5} aria-hidden />
        ) : (
          <Check size={11} strokeWidth={3} aria-hidden />
        ))}
    </BaseCheckbox.Root>
  )
}
