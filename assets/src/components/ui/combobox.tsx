import { Combobox as BaseCombobox } from "@base-ui/react/combobox"
import { Check, ChevronDown } from "lucide-react"

/** Themed searchable single-select over the Base UI Combobox primitive: type
 * to filter the options, click or enter to pick. */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <BaseCombobox.Root
      items={options}
      value={value || null}
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
    >
      <div className="relative">
        <BaseCombobox.Input
          placeholder={placeholder}
          className="h-[34px] w-full rounded-ctrl border border-hair-strong bg-canvas pr-8 pl-3 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent-edge focus-visible:outline-none"
        />
        <BaseCombobox.Trigger className="absolute top-1/2 right-2 -translate-y-1/2 text-muted">
          <ChevronDown size={14} aria-hidden />
        </BaseCombobox.Trigger>
      </div>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner sideOffset={4} className="z-[60]">
          <BaseCombobox.Popup className="max-h-[260px] w-[var(--anchor-width)] min-w-[220px] overflow-auto rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none">
            <BaseCombobox.Empty className="px-2 py-2 text-[12px] text-faint">No branches match.</BaseCombobox.Empty>
            <BaseCombobox.List>
              {(option: string) => (
                <BaseCombobox.Item
                  key={option}
                  value={option}
                  className="flex h-[30px] cursor-pointer items-center gap-2 rounded-ctrl pr-2 pl-1.5 font-mono text-[12px] text-text outline-none data-[highlighted]:bg-soft"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center text-accent">
                    <BaseCombobox.ItemIndicator>
                      <Check size={13} strokeWidth={2.5} aria-hidden />
                    </BaseCombobox.ItemIndicator>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option}</span>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  )
}
