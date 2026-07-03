import { useEffect, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { Check, ChevronDown, Info, Keyboard, Palette, SlidersHorizontal, X } from "lucide-react"

import { uiStore, type Density, type MonoSize } from "../stores/ui-store"
import { THEME_CODE, THEME_LABELS, THEMES, type ThemeName } from "../themes"

type Pane = "appearance" | "review" | "keyboard" | "about"

const NAV: { id: Pane; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={16} aria-hidden /> },
  { id: "review", label: "Review defaults", icon: <SlidersHorizontal size={16} aria-hidden /> },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard size={16} aria-hidden /> },
  { id: "about", label: "About", icon: <Info size={16} aria-hidden /> },
]

/** Settings modal: a centered panel over the dimmed board (a bottom sheet on
 * phones). Preferences apply live, so the footer carries only a Done action. */
export const SettingsModal = observer(function SettingsModal() {
  const [pane, setPane] = useState<Pane>("appearance")
  const open = uiStore.settingsOpen
  const close = () => uiStore.setSettingsOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close settings"
        onClick={close}
        className="absolute inset-0 bg-[oklch(0%_0_0/0.5)] backdrop-blur-[2px]"
      />
      <div className="relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[18px] border border-hair-strong bg-surface shadow-[0_20px_60px_oklch(0%_0_0/0.4)] sm:h-[560px] sm:max-w-[720px] sm:rounded-[16px]">
        <header className="flex items-center gap-3 border-b border-hair px-5 py-4">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink">Settings</h2>
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
            <span className="hidden px-2 pb-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint sm:block">
              Settings
            </span>
            {NAV.map((item) => {
              const active = item.id === pane
              return (
                <button
                  key={item.id}
                  onClick={() => setPane(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-[36px] shrink-0 items-center gap-[9px] rounded-ctrl px-3 text-[13px] font-medium ${
                    active
                      ? "bg-accent-soft text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                      : "text-text hover:bg-soft"
                  }`}
                >
                  <span className={active ? "text-accent-bright" : "text-muted"}>{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {pane === "appearance" && <AppearancePane />}
            {pane === "review" && <ReviewDefaultsPane />}
            {pane === "keyboard" && <KeyboardPane />}
            {pane === "about" && <AboutPane />}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-hair px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <Check size={13} className="text-approve" aria-hidden />
            Changes apply instantly
          </span>
          <span className="flex-1" />
          <button
            onClick={close}
            className="inline-flex h-[32px] items-center rounded-ctrl bg-accent px-4 text-[13px] font-semibold text-on-accent hover:brightness-110"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
})

const AppearancePane = observer(function AppearancePane() {
  return (
    <div className="flex flex-col gap-6">
      <PaneHead
        title="Appearance"
        lede="How Suikou looks while you read code and prose for a stretch. Applies across every project."
      />
      <Row title="Theme" sub="Syntax and surface palette. 15 built in, light and dark.">
        <ThemePicker />
      </Row>
      <Row title="Density" sub="Row height and padding across panels and lists.">
        <Segmented<Density>
          value={uiStore.density}
          onChange={(v) => uiStore.setDensity(v)}
          options={[
            ["compact", "Compact"],
            ["comfortable", "Comfortable"],
            ["loose", "Loose"],
          ]}
        />
      </Row>
      <Row title="Code wrap" sub="Soft-wrap long lines in the source view instead of scrolling.">
        <Toggle checked={uiStore.codeWrap} onChange={(v) => uiStore.setCodeWrap(v)} />
      </Row>
      <Row title="Mono size" sub="Font size for code, diffs, and anchor readouts.">
        <Segmented<MonoSize>
          value={uiStore.monoSize}
          onChange={(v) => uiStore.setMonoSize(v)}
          options={[
            ["small", "Small"],
            ["default", "Default"],
            ["large", "Large"],
          ]}
        />
      </Row>
    </div>
  )
})

const ThemePicker = observer(function ThemePicker() {
  const [open, setOpen] = useState(false)
  const light = THEMES.filter((t) => !THEME_CODE[t].dark)
  const dark = THEMES.filter((t) => THEME_CODE[t].dark)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-[30px] min-w-[150px] items-center gap-2 rounded-ctrl border border-hair-strong bg-canvas px-3 text-[13px] font-medium text-ink"
      >
        <span className="flex-1 text-left">{THEME_LABELS[uiStore.theme]}</span>
        <ChevronDown size={13} className="text-muted" aria-hidden />
      </button>
      {open && (
        <>
          <button aria-hidden className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 max-h-[260px] w-[200px] overflow-auto rounded-panel border border-hair-strong bg-surface p-1 shadow-[0_12px_30px_oklch(0%_0_0/0.3)]">
            <ThemeGroup
              label="Light"
              names={light}
              onPick={(t) => {
                setOpen(false)
                uiStore.setTheme(t)
              }}
            />
            <ThemeGroup
              label="Dark"
              names={dark}
              onPick={(t) => {
                setOpen(false)
                uiStore.setTheme(t)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
})

function ThemeGroup({
  label,
  names,
  onPick,
}: {
  label: string
  names: readonly ThemeName[]
  onPick: (t: ThemeName) => void
}) {
  return (
    <>
      <div className="px-2 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      {names.map((name) => {
        const active = name === uiStore.theme
        return (
          <button
            key={name}
            onClick={() => onPick(name)}
            className={`flex h-[30px] w-full items-center gap-2 rounded-ctrl px-2 text-[12.5px] ${
              active ? "text-accent-bright" : "text-text hover:bg-soft"
            }`}
          >
            <span className="flex-1 text-left">{THEME_LABELS[name]}</span>
            {active && <Check size={13} aria-hidden />}
          </button>
        )
      })}
    </>
  )
}

function ReviewDefaultsPane() {
  return (
    <div className="flex flex-col gap-6">
      <PaneHead title="Review defaults" lede="How new reviews open until you change them per review." />
      <p className="text-[12.5px] text-muted">
        {/* ponytail: review-default settings need their own ui-store state and a
            consumer in the review surface, which is rebuilt in a later pass. */}
        Review defaults arrive with the review surface rebuild.
      </p>
    </div>
  )
}

function KeyboardPane() {
  const keys: [string, string][] = [
    ["⌘,", "Open settings"],
    ["/", "Focus the file filter"],
    ["Esc", "Close a dialog"],
  ]
  return (
    <div className="flex flex-col gap-6">
      <PaneHead title="Keyboard" lede="Reach the common actions without leaving the keyboard." />
      <div className="flex flex-col gap-2">
        {keys.map(([key, what]) => (
          <div key={key} className="flex items-center gap-3 text-[13px]">
            <kbd className="inline-flex h-[24px] min-w-[28px] items-center justify-center rounded bg-soft px-2 font-mono text-[11px] font-semibold text-muted shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
              {key}
            </kbd>
            <span className="text-text">{what}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AboutPane() {
  return (
    <div className="flex flex-col gap-4">
      <PaneHead title="About" lede="" />
      <div className="flex items-center gap-3">
        <span className="grid size-[44px] place-items-center rounded-[12px] bg-accent text-[20px] font-black text-on-accent">
          推
        </span>
        <div>
          <div className="text-[15px] font-bold text-ink">推敲 Suikou</div>
          <div className="text-[12px] text-muted">Deliberate review of what an agent wrote.</div>
        </div>
      </div>
      <p className="max-w-[52ch] text-[12.5px] leading-[1.5] text-muted">
        推敲 is the act of weighing the exact word to use. Suikou turns reviewing an agent's output
        into a real workbench: read closely, anchor comments, set a verdict per file, submit a round,
        iterate.
      </p>
    </div>
  )
}

function PaneHead({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[16px] font-bold tracking-[-0.015em] text-ink">{title}</h3>
      {lede && <p className="max-w-[52ch] text-[12.5px] leading-[1.45] text-muted">{lede}</p>}
    </div>
  )
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-t border-hair pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="text-[11.5px] leading-[1.4] text-muted">{sub}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="inline-flex rounded-ctrl bg-soft p-0.5 shadow-[inset_0_0_0_0.5px_var(--hair-strong)]">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`h-[26px] rounded-[7px] px-3 text-[12px] font-medium ${
            v === value ? "bg-canvas text-ink shadow-[0_1px_2px_oklch(0%_0_0/0.15)]" : "text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[24px] w-[42px] items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-control"
      }`}
    >
      <span
        className={`inline-block size-[18px] rounded-full bg-[oklch(100%_0_0)] shadow-sm transition-transform ${
          checked ? "translate-x-[21px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  )
}
