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

function AccordionContent({ className, ...props }: AccordionPrimitive.Panel.Props) {
  return <AccordionPrimitive.Panel data-slot="accordion-content" className={cn("pl-3", className)} {...props} />
}

const AccordionItem = AccordionPrimitive.Item

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
