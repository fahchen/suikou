import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** Themed accordion over Base UI Accordion: a chevron-led row whose panel opens
 * in place. Multiple items may be open at once; all start closed. */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-ctrl px-1.5 py-1.5 text-left outline-none hover:bg-soft",
          className,
        )}
        {...props}
      >
        <ChevronRight
          size={12}
          className="shrink-0 text-faint transition-transform group-data-[panel-open]:rotate-90"
          aria-hidden
        />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      // Base UI measures the panel into --accordion-panel-height; animating that
      // against the 0 of the starting/ending styles is what makes it unfold.
      className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0"
      {...props}
    >
      <div className={cn("pl-3", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

const AccordionItem = AccordionPrimitive.Item

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
