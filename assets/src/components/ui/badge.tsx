import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Themed count/status chip over Base UI's render primitive. Variants map onto
 * the review palette so callers never hand-roll a pill at the call site. */
const badgeVariants = cva(
  "inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-2xs font-semibold whitespace-nowrap tabular-nums [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        muted: "bg-soft text-muted",
        open: "bg-accent-soft text-accent-bright",
        blocker: "bg-request-soft text-request",
        pending: "bg-amber-soft text-amber",
        warning: "bg-amber-soft text-amber",
      },
      // `label` is the uppercase kind tag (a board card's Diff / Files / Stack),
      // edged in its variant's hue; `count` is the default numeric chip.
      shape: {
        count: "",
        label: "h-[17px] px-[7px] font-bold uppercase tracking-[0.04em]",
      },
    },
    compoundVariants: [
      { shape: "label", variant: "muted", className: "shadow-[inset_0_0_0_0.5px_var(--hair-strong)]" },
      { shape: "label", variant: "open", className: "shadow-[inset_0_0_0_0.5px_var(--accent-edge)]" },
      { shape: "label", variant: "warning", className: "shadow-[inset_0_0_0_0.5px_var(--amber-edge)]" },
    ],
    defaultVariants: {
      variant: "muted",
      shape: "count",
    },
  },
)

function Badge({
  className,
  variant = "muted",
  shape = "count",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant, shape }), className) }, props),
    render,
    state: { slot: "badge", variant, shape },
  })
}

export { Badge }
