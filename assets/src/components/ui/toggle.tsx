import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Themed two-state button over Base UI Toggle, sized to the app's controls.
 * `check` marks something done: pressed lifts into the approve hue. `mark`
 * leaves the pressed look to its own glyph (a filled check), keeping only the
 * hover wash. */
const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ctrl font-semibold whitespace-nowrap outline-none transition-[color,background-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent-edge disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        check:
          "text-muted hover:bg-soft hover:text-ink data-[pressed]:bg-approve-soft data-[pressed]:text-approve data-[pressed]:hover:text-approve",
        mark: "text-muted hover:bg-soft hover:text-ink",
      },
      size: {
        sm: "h-[26px] px-2 text-xs",
        default: "h-[30px] px-3 text-xs",
        "icon-sm": "size-[26px] coarse:size-[36px]",
        touch: "size-[44px]",
      },
    },
    defaultVariants: {
      variant: "check",
      size: "default",
    },
  },
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle }
