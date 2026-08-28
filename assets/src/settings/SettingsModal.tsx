import { useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { Bell, Bug, Check, Info, Palette, ScrollText, SlidersHorizontal, X } from "lucide-react"

import { AboutPane } from "./panes/AboutPane"
import { AppearancePane } from "./panes/AppearancePane"
import { ErrorsPane } from "./panes/ErrorsPane"
import { InstructionsPane } from "./panes/InstructionsPane"
import { NotificationsPane } from "./panes/NotificationsPane"
import { ReviewDefaultsPane } from "./panes/ReviewDefaultsPane"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { uiStore } from "../stores/ui-store"

type Pane = "appearance" | "review" | "instructions" | "notifications" | "errors" | "about"

type NavItem = { id: Pane; label: string; icon: ReactNode }

const APPEARANCE: NavItem = { id: "appearance", label: "Appearance", icon: <Palette size={16} aria-hidden /> }
const REVIEW: NavItem = { id: "review", label: "Review defaults", icon: <SlidersHorizontal size={16} aria-hidden /> }
const INSTRUCTIONS: NavItem = { id: "instructions", label: "Instructions", icon: <ScrollText size={16} aria-hidden /> }
const NOTIFICATIONS: NavItem = { id: "notifications", label: "Notifications", icon: <Bell size={16} aria-hidden /> }
const ERRORS: NavItem = { id: "errors", label: "Errors", icon: <Bug size={16} aria-hidden /> }
const ABOUT: NavItem = { id: "about", label: "About", icon: <Info size={16} aria-hidden /> }

// Errors only earns a place once the reader has asked for the collecting; until
// then the pane would have nothing to show. It sits before About, which holds
// the switch that summons it.
function navItems(): NavItem[] {
  const diagnostics = uiStore.errorLog ? [ERRORS] : []
  return [APPEARANCE, REVIEW, INSTRUCTIONS, NOTIFICATIONS, ...diagnostics, ABOUT]
}

/** Settings modal: a centered panel over the dimmed board (a bottom sheet on
 * phones). Preferences apply live, so the footer carries only a Done action. */
export const SettingsModal = observer(function SettingsModal() {
  const [pane, setPane] = useState<Pane>("appearance")
  const open = uiStore.settingsOpen
  const close = () => uiStore.setSettingsOpen(false)
  const items = navItems()
  // Switching collection off takes the Errors pane with it — fall back to the
  // pane holding the switch that did it, rather than showing nothing.
  const active = items.some((item) => item.id === pane) ? pane : ABOUT.id

  return (
    <Dialog open={open} onClose={close} className="max-h-[86vh] overflow-hidden sm:h-[560px] sm:max-w-[720px]">
        <header className="flex items-center gap-3 border-b border-hair px-5 py-4">
          <DialogTitle className="text-base font-bold tracking-[-0.01em] text-ink">Settings</DialogTitle>
          <span className="flex-1" />
          <button
            onClick={close}
            aria-label="Close"
            className="grid size-[30px] place-items-center rounded-full bg-soft text-muted hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-hair px-3 py-2 sm:w-[200px] sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:px-3 sm:py-4">
            <span className="hidden px-2 pb-2 text-2xs font-bold uppercase tracking-[0.12em] text-faint sm:block">
              Settings
            </span>
            {items.map((item) => {
              const current = item.id === active
              return (
                <button
                  key={item.id}
                  onClick={() => setPane(item.id)}
                  aria-current={current ? "true" : undefined}
                  className={`inline-flex h-[36px] shrink-0 items-center gap-[9px] rounded-ctrl px-3 text-sm font-medium ${
                    current
                      ? "bg-accent-soft text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                      : "text-text hover:bg-soft"
                  }`}
                >
                  <span className={current ? "text-accent-bright" : "text-muted"}>{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {active === "appearance" && <AppearancePane />}
            {active === "review" && <ReviewDefaultsPane />}
            {active === "instructions" && <InstructionsPane />}
            {active === "notifications" && <NotificationsPane />}
            {active === "errors" && <ErrorsPane />}
            {active === "about" && <AboutPane />}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-hair px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Check size={13} className="text-approve" aria-hidden />
            Changes apply instantly
          </span>
          <span className="flex-1" />
          <button
            onClick={close}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110"
          >
            Done
          </button>
        </footer>
    </Dialog>
  )
})
