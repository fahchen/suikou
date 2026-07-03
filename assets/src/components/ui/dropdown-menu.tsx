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
}: {
  children: ReactNode
  align?: "start" | "center" | "end"
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={6} align={align} className="z-50">
        <Menu.Popup className="min-w-[180px] rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)] outline-none">
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
}: {
  children: ReactNode
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <Menu.Item
      onClick={onClick}
      className={`flex h-[32px] cursor-pointer items-center gap-2 rounded-ctrl px-2.5 text-[12.5px] outline-none data-[highlighted]:bg-soft ${
        destructive ? "text-request" : "text-text"
      }`}
    >
      {children}
    </Menu.Item>
  )
}
