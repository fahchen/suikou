import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

/** Themed tabs over Base UI Tabs: an underlined tab strip on a hairline rule.
 * Keyboard navigation, roving focus, and panel wiring come from the primitive. */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex min-h-0 flex-col", className)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex shrink-0 items-center gap-4 border-b border-hair-strong px-3", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 text-xs font-semibold text-muted outline-none hover:text-ink data-[selected]:text-ink data-[selected]:shadow-[inset_0_-1.5px_0_0_var(--accent)]",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("min-h-0 flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
