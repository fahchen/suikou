import { useLayoutEffect, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { AnimatePresence, motion } from "motion/react"
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

// One curve for the whole panel: the pill sliding between items, the panel
// resizing into the next pane, and that pane fading in all read as one move.
const PANEL_EASE = [0.22, 1, 0.36, 1] as const
const PANE_FADE = { duration: 0.13, ease: "easeOut" } as const

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
  const { wrapRef, setPane: measurePane, paneHeight } = usePaneHeight()

  return (
    <Dialog open={open} onClose={close} className="max-h-[86vh] overflow-hidden sm:max-h-[560px] sm:max-w-[720px]">
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

        {/* Height is pinned from the measured pane so the card grows and
            shrinks into the next one instead of snapping: a height set by
            content alone never changes the specified value, so there is nothing
            for a transition to run on. Deliberately not `flex-1` — that would
            hand the main axis back to the flex line and the pinned height would
            be ignored. The hook caps the value, so the body still scrolls. */}
        <div
          ref={wrapRef}
          className="flex min-h-0 flex-col transition-[height] duration-200 ease-out-quint sm:flex-row"
          style={{ height: paneHeight }}
        >
          <nav
            className="relative flex shrink-0 gap-1 overflow-x-auto border-b border-hair px-3 py-2 sm:w-[200px] sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:px-3 sm:py-4"
          >
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
                  className={`relative inline-flex h-[36px] shrink-0 items-center gap-[9px] rounded-ctrl px-3 text-sm font-medium transition-colors duration-150 ease-out ${
                    current ? "text-accent-bright" : "text-text hover:bg-soft"
                  }`}
                >
                  {/* One pill shared by every item, so the selection travels to
                      the tab that was clicked instead of blinking out of one and
                      into the next. `layoutId` is what carries it across; the
                      nav needs no measuring of its own, in either layout. */}
                  {current && (
                    <motion.span
                      layoutId="settings-nav-pill"
                      aria-hidden
                      transition={{ duration: 0.2, ease: PANEL_EASE }}
                      className="absolute inset-0 rounded-ctrl bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                    />
                  )}
                  <span className={`relative transition-colors duration-150 ease-out ${current ? "text-accent-bright" : "text-muted"}`}>
                    {item.icon}
                  </span>
                  <span className="relative">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Keyed on the pane so a switch remounts the body and replays the
              arrival animation — without the key React would patch one pane
              into the next and the change would land with no motion at all. */}
          <div className="min-h-0 flex-1 overflow-auto">
            {/* `wait` so the panel only starts resizing once the old pane is
                gone: overlapping them would animate the height towards whichever
                is taller and then correct itself. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                ref={measurePane}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={PANE_FADE}
                className="px-6 py-5"
              >
                {active === "appearance" && <AppearancePane />}
                {active === "review" && <ReviewDefaultsPane />}
                {active === "instructions" && <InstructionsPane />}
                {active === "notifications" && <NotificationsPane />}
                {active === "errors" && <ErrorsPane />}
                {active === "about" && <AboutPane />}
              </motion.div>
            </AnimatePresence>
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

/** The height the panel should be for the pane on show, so the switch can be
 * transitioned. Measured and applied as a real height rather than left to
 * `motion`'s layout projection, which resizes by scaling and would stretch the
 * text inside the pane while it ran. Capped at what the panel is allowed to be,
 * past which the body scrolls instead. */
function usePaneHeight() {
  // Both are state, not refs: the pane is remounted on every switch and the
  // measuring has to run again when the new node arrives.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null)
  const [pane, setPane] = useState<HTMLDivElement | null>(null)
  const [paneHeight, setPaneHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const nav = wrap?.firstElementChild as HTMLElement | null
    const panel = wrap?.parentElement
    if (!wrap || !pane || !nav || !panel) return

    const measure = () => {
      // The nav sits above the body on phones and beside it from `sm`, so it
      // either adds to the height or competes with it. Its own box is no use
      // for the second case — a column nav is stretched to whatever height is
      // pinned here, which would feed the last measurement straight back in —
      // so the items are measured instead.
      const stacked = getComputedStyle(wrap).flexDirection === "column"
      const navHeight =
        [...nav.children].reduce((low, item) => {
          const el = item as HTMLElement
          return Math.max(low, el.offsetTop + el.offsetHeight)
        }, 0) + parseFloat(getComputedStyle(nav).paddingBottom)
      const wanted = stacked ? navHeight + pane.offsetHeight : Math.max(navHeight, pane.offsetHeight)
      // Everything the panel spends on chrome — header, footer, the phone grip
      // — is height the panes cannot have.
      const chrome = panel.offsetHeight - wrap.offsetHeight
      const cap = parseFloat(getComputedStyle(panel).maxHeight) - chrome
      setPaneHeight(Math.min(wanted, Number.isFinite(cap) ? cap : wanted))
    }

    measure()
    // Panes also change height on their own — a disclosure opening, an error
    // list filling up — and the whole panel reflows at the `sm` breakpoint.
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [wrap, pane])

  return { wrapRef: setWrap, setPane, paneHeight }
}
