import { Menu } from "@base-ui/react/menu"
import type { ReactElement, ReactNode } from "react"

/** Themed dropdown menu over the Base UI Menu primitive. */
export function DropdownMenu({ children }: { children: ReactNode }) {
  return <Menu.Root>{children}</Menu.Root>
}

/** Wrap an existing element as the trigger; pass it via `render`. */
export function DropdownMenuTrigger({ render }: { render: ReactElement }) {
  return <Menu.Trigger render={render} />
}

export function DropdownMenuContent({
  children,
  align = "end",
  className = "",
}: {
  children: ReactNode
  align?: "start" | "center" | "end"
  className?: string
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={6} align={align} className="z-50">
        <Menu.Popup className={`min-w-[180px] rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none ${className}`}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export function DropdownMenuItem({
  children,
  onClick,
  destructive,
  selected,
}: {
  children: ReactNode
  onClick?: () => void
  destructive?: boolean
  selected?: boolean
}) {
  const hasSelectedState = selected !== undefined

  return (
    <Menu.Item
      onClick={onClick}
      className={`flex h-[32px] cursor-pointer items-center gap-2 rounded-ctrl px-2.5 text-[12.5px] outline-none data-[highlighted]:bg-soft ${
        destructive ? "text-request" : selected ? "bg-soft text-ink" : "text-text"
      }`}
    >
      {children}
      {hasSelectedState && <span className={`ml-auto size-1.5 shrink-0 rounded-full bg-accent ${selected ? "" : "opacity-0"}`} aria-hidden />}
    </Menu.Item>
  )
}
