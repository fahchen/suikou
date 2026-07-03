import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox"
import { Check } from "lucide-react"

/** Themed checkbox over the Base UI primitive: a hairline square that fills with
 * the accent and shows a check when on. */
export function Checkbox({
  checked,
  onCheckedChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  "aria-label"?: string
}) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={ariaLabel}
      className="grid size-[16px] shrink-0 cursor-pointer place-items-center rounded-[5px] border border-hair-strong bg-canvas transition-colors data-[checked]:border-accent data-[checked]:bg-accent"
    >
      <BaseCheckbox.Indicator className="flex text-on-accent">
        <Check size={11} strokeWidth={3} aria-hidden />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}
