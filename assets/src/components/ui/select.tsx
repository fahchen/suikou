import { Select as BaseSelect } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

/** Themed single-select over the Base UI Select primitive. */
export function Select({
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
    <BaseSelect.Root
      value={value || null}
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
    >
      <BaseSelect.Trigger className="flex h-[34px] w-full cursor-pointer items-center gap-2 rounded-ctrl border border-hair-strong bg-canvas px-3 text-[13px] text-ink focus-visible:border-accent-edge focus-visible:outline-none">
        <BaseSelect.Value className="min-w-0 flex-1 truncate text-left" placeholder={placeholder} />
        <BaseSelect.Icon className="shrink-0 text-muted">
          <ChevronDown size={14} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-[60]">
          <BaseSelect.Popup className="max-h-[260px] min-w-[220px] overflow-auto rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none">
            {options.map((option) => (
              <BaseSelect.Item
                key={option}
                value={option}
                className="flex h-[30px] cursor-pointer items-center gap-2 rounded-ctrl pr-2 pl-1.5 font-mono text-[12px] text-text outline-none data-[highlighted]:bg-soft"
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center text-accent">
                  <BaseSelect.ItemIndicator>
                    <Check size={13} strokeWidth={2.5} aria-hidden />
                  </BaseSelect.ItemIndicator>
                </span>
                <BaseSelect.ItemText className="min-w-0 flex-1 truncate">{option}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
