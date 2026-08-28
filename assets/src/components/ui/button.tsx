import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Themed button over Base UI Button: the app's control heights and palette in
 * one place, so call sites pick a variant instead of restating Tailwind. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ctrl font-semibold whitespace-nowrap outline-none transition-[color,background-color,border-color,filter,scale] duration-150 ease-out select-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent-edge disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent: "bg-accent text-on-accent hover:brightness-[1.06]",
        ghost: "text-muted hover:bg-soft hover:text-ink",
        outline: "border border-hair-strong bg-canvas text-ink hover:bg-soft",
        danger: "bg-request-soft text-request hover:brightness-[1.04]",
      },
      size: {
        sm: "h-[26px] px-2 text-xs",
        default: "h-[30px] px-3 text-xs",
        lg: "h-[35px] px-4 text-sm",
        icon: "size-[30px]",
        "icon-sm": "size-[26px]",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button }
