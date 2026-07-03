import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"

/** Themed single-select segmented control over Base UI ToggleGroup: a pill
 * track whose pressed option lifts onto the canvas. Always keeps one selected —
 * clicking the active option is a no-op rather than clearing it. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: [T, string][]
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined
        if (picked) onChange(picked)
      }}
      className="inline-flex rounded-ctrl bg-soft p-0.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]"
    >
      {options.map(([optionValue, label]) => (
        <Toggle
          key={optionValue}
          value={optionValue}
          className="h-[26px] cursor-pointer rounded-[7px] px-3 text-[12px] font-medium text-muted hover:text-ink data-[pressed]:bg-canvas data-[pressed]:text-ink data-[pressed]:shadow-[0_1px_2px_oklch(0%_0_0/0.15)]"
        >
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
