import { Select as BaseSelect } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

export type SelectGroup = { label: string; options: { value: string; label: string }[] }

/** Themed single-select over the Base UI Select primitive, with grouped
 * options and a checkmark on the current value. */
export function Select({
  value,
  onValueChange,
  groups,
  "aria-label": ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  groups: SelectGroup[]
  "aria-label"?: string
}) {
  const items = Object.fromEntries(
    groups.flatMap((group) => group.options.map((option) => [option.value, option.label])),
  )
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className="inline-flex h-[30px] min-w-[150px] cursor-pointer items-center gap-2 rounded-ctrl border border-hair-strong bg-canvas px-3 text-[13px] font-medium text-ink"
      >
        <BaseSelect.Value className="flex-1 text-left" />
        <BaseSelect.Icon>
          <ChevronDown size={13} className="text-muted" aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} align="end" className="z-[70]">
          <BaseSelect.Popup className="max-h-[260px] w-[200px] overflow-auto rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none">
            {groups.map((group) => (
              <BaseSelect.Group key={group.label}>
                <BaseSelect.GroupLabel className="px-2 pt-2 pb-1 text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase">
                  {group.label}
                </BaseSelect.GroupLabel>
                {group.options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    className="flex h-[30px] cursor-pointer items-center gap-2 rounded-ctrl px-2 text-[12.5px] text-text outline-none data-[highlighted]:bg-soft data-[selected]:text-accent-bright"
                  >
                    <BaseSelect.ItemText className="flex-1">{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator>
                      <Check size={13} aria-hidden />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.Group>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
