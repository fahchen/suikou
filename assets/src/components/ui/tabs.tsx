import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

/** Themed tabs over Base UI Tabs: an underlined tab strip on a hairline rule.
 * Keyboard navigation, roving focus, and panel wiring come from the primitive. */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex min-h-0 flex-col", className)} {...props} />
}

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("relative flex shrink-0 items-center gap-4 border-b border-hair-strong px-3", className)}
      {...props}
    >
      {children}
      {/* Base UI measures the active tab into CSS vars; sliding the underline
          between them is what animates the switch. */}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className="absolute bottom-0 left-[var(--active-tab-left)] h-[1.5px] w-[var(--active-tab-width)] bg-accent transition-all duration-200 ease-out"
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 text-xs font-semibold text-muted outline-none transition-colors hover:text-ink data-[active]:text-ink",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "min-h-0 flex-1 outline-none transition-opacity duration-150 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
