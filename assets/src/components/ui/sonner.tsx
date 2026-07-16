import { observer } from "mobx-react-lite"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { uiStore } from "../../stores/ui-store"
import { THEME_CODE } from "../../themes"

/** Themed sonner Toaster wired to the app's [data-theme] palette. */
const Toaster = observer(function Toaster(props: ToasterProps) {
  const dark = THEME_CODE[uiStore.theme].dark

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--hair-strong)",
          "--border-radius": "var(--r-panel)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "bg-surface opacity-100 shadow-[0_12px_30px_oklch(0%_0_0/0.3)]",
          description: "text-muted opacity-100",
        },
      }}
      {...props}
    />
  )
})

export { Toaster }
