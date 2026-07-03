import { Switch as BaseSwitch } from "@base-ui/react/switch"

/** Themed switch over the Base UI primitive: a pill track that fills with the
 * accent and slides its thumb when on. */
export function Switch({
  checked,
  onCheckedChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  "aria-label"?: string
}) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className="relative inline-flex h-[24px] w-[42px] cursor-pointer items-center rounded-full bg-control transition-colors data-[checked]:bg-accent"
    >
      <BaseSwitch.Thumb className="size-[18px] translate-x-[3px] rounded-full bg-[oklch(100%_0_0)] shadow-sm transition-transform data-[checked]:translate-x-[21px]" />
    </BaseSwitch.Root>
  )
}
