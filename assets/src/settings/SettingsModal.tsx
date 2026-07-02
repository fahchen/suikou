import { useState } from "react"
import { observer } from "mobx-react-lite"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  Check,
  ChevronDown,
  Info,
  Keyboard,
  Palette,
  Sliders,
  XIcon
} from "lucide-react"

import { useMediaQuery, MOBILE_QUERY } from "../hooks/use-media-query"
import { uiStore } from "../stores/ui-store"
import { THEMES, THEME_CODE, THEME_LABELS, type ThemeName } from "../themes"
import type {
  CommentMode,
  Density,
  DiffLayout,
  FileDisplayMode
} from "../stores/ui-store"
import type { MarkdownFlavor } from "../markdown/render"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type SectionId = "appearance" | "review" | "keyboard" | "about"

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "review", label: "Review defaults", icon: Sliders },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "about", label: "About", icon: Info }
]

export const SettingsModal = observer(function SettingsModal({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useMediaQuery(MOBILE_QUERY)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/40 duration-150",
            "supports-backdrop-filter:backdrop-blur-[3px]",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0"
          )}
        />
        <DialogPrimitive.Popup
          aria-label="Settings"
          className={cn(
            "fixed z-50 outline-none",
            "duration-150 data-open:animate-in data-closed:animate-out",
            isMobile
              ? // Bottom sheet
                "inset-x-0 bottom-0 top-0 flex flex-col bg-canvas data-open:slide-in-from-bottom-4 data-open:fade-in-0 data-closed:slide-out-to-bottom-4 data-closed:fade-out-0"
              : // Centered modal
                "left-1/2 top-1/2 flex w-full max-w-[720px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[13px] border border-line bg-surface shadow-[var(--elev-overlay)] max-h-[calc(100vh-4rem)] h-[488px] data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          {isMobile ? <MobileSheet /> : <DesktopModal />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})

function DesktopModal() {
  const [section, setSection] = useState<SectionId>("appearance")
  return (
    <>
      <header className="flex h-12 items-center gap-2 border-b border-line bg-panel px-4">
        <DialogPrimitive.Title className="text-[14.5px] font-bold tracking-[-0.015em] text-heading">
          Settings
        </DialogPrimitive.Title>
        <span className="flex-1" />
        <DialogPrimitive.Close
          aria-label="Close settings"
          title="Close"
          className="grid size-7 place-items-center rounded-[9px] bg-soft text-muted-foreground shadow-[inset_0_0_0_0.5px_var(--line-strong)] transition-colors hover:bg-hover hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
        >
          <XIcon aria-hidden size={15} />
        </DialogPrimitive.Close>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[178px_1fr]">
        <SectionRail active={section} onSelect={setSection} />
        <div className="min-h-0 overflow-auto pt-[18px] pr-[22px] pb-[22px] pl-[22px]">
          <ActivePane section={section} />
        </div>
      </div>
      <footer className="flex h-11 items-center gap-2.5 border-t border-line bg-canvas/60 px-4">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
          <Check size={13} aria-hidden />
          Changes apply instantly
        </span>
        <span className="flex-1" />
        <DialogPrimitive.Close
          render={<Button size="sm" aria-label="Close settings" />}
        >
          Done
        </DialogPrimitive.Close>
      </footer>
    </>
  )
}

function SectionRail({
  active,
  onSelect
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
}) {
  return (
    <nav
      role="tablist"
      aria-label="Settings sections"
      className="flex flex-col gap-0.5 border-r border-line bg-rail py-[11px] px-[9px]"
    >
      <p className="px-[9px] pt-1 pb-1.5 text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase">
        Settings
      </p>
      {SECTIONS.map((section) => {
        const selected = section.id === active
        const Icon = section.icon
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(section.id)}
            className={cn(
              "flex h-[33px] shrink-0 cursor-pointer items-center gap-[9px] rounded-[9px] px-[10px] text-left text-[12.5px] font-medium tracking-[-0.008em] transition-colors duration-150",
              selected
                ? "bg-accent-soft text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                : "text-text hover:bg-hover"
            )}
          >
            <Icon
              size={16}
              aria-hidden
              className={selected ? "text-accent-bright" : "text-muted-foreground"}
            />
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ActivePane({ section }: { section: SectionId }) {
  switch (section) {
    case "appearance":
      return <AppearancePane />
    case "review":
      return <ReviewDefaultsPane />
    case "keyboard":
      return <KeyboardPane />
    case "about":
      return <AboutPane />
  }
}

function PaneHeader({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[15px] font-bold tracking-[-0.015em] text-heading">
        {title}
      </h3>
      {lede && (
        <p className="mt-0.5 max-w-[60ch] text-[12px] leading-[1.45] text-faint">
          {lede}
        </p>
      )}
    </div>
  )
}

function ControlRow({
  label,
  sub,
  control,
  stackedOnMobile = false
}: {
  label: string
  sub?: string
  control: React.ReactNode
  stackedOnMobile?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-4 border-t border-line first:border-t-0 py-[11px]",
        stackedOnMobile && "sm:flex-row sm:items-center flex-col items-stretch gap-3"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-[580] tracking-[-0.008em] text-heading">
          {label}
        </span>
        {sub && (
          <span className="max-w-[46ch] text-[11.5px] leading-[1.4] text-faint">
            {sub}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  )
}

const AppearancePane = observer(function AppearancePane() {
  const ui = uiStore
  return (
    <>
      <PaneHeader
        title="Appearance"
        lede="How Suikou looks while you read code and prose for a stretch. Applies across every project."
      />
      <ControlRow
        label="Theme"
        sub="Syntax and surface palette. 13 built in, light and dark."
        control={<ThemePicker value={ui.theme} onChange={(t) => ui.setTheme(t)} />}
      />
      <ControlRow
        label="Density"
        sub="Row height and padding across panels and lists."
        control={
          <Segmented
            value={ui.density}
            options={[
              { value: "tight", label: "Compact" },
              { value: "normal", label: "Comfortable" },
              { value: "loose", label: "Loose" }
            ]}
            onChange={(v) => ui.setDensity(v as Density)}
          />
        }
      />
      <ControlRow
        label="Code wrap"
        sub="Soft-wrap long lines in the source view instead of scrolling."
        control={
          <Switch
            checked={ui.wrapLines}
            onCheckedChange={(v) => ui.setWrapLines(v)}
            ariaLabel="Code wrap"
          />
        }
      />
    </>
  )
})

const ReviewDefaultsPane = observer(function ReviewDefaultsPane() {
  const ui = uiStore
  return (
    <>
      <PaneHeader
        title="Review defaults"
        lede="Starting points for a new review. A single review can still override these from the toolbar display menu."
      />
      <ControlRow
        label="Default comment layout"
        sub="Where new threads appear at their anchored line."
        control={
          <Segmented
            value={ui.commentMode}
            options={[
              { value: "inline", label: "Inline" },
              { value: "side", label: "Side" }
            ]}
            onChange={(v) => ui.setCommentMode(v as CommentMode)}
          />
        }
      />
      <ControlRow
        label="Default diff view"
        sub="How a git diff review renders its hunks."
        control={
          <Segmented
            value={ui.diffLayout}
            options={[
              { value: "unified", label: "Unified" },
              { value: "side", label: "Side by side" }
            ]}
            onChange={(v) => ui.setDiffLayout(v as DiffLayout)}
          />
        }
      />
      <ControlRow
        label="Default file mode"
        sub="Open one file at a time, or stack all files in the editor."
        control={
          <Segmented
            value={ui.fileDisplayMode}
            options={[
              { value: "single", label: "Single file" },
              { value: "all", label: "All files" }
            ]}
            onChange={(v) => ui.setFileDisplayMode(v as FileDisplayMode)}
          />
        }
      />
      <ControlRow
        label="Markdown flavor"
        sub="How Markdown previews are parsed and rendered."
        control={
          <Segmented
            value={ui.markdownFlavor}
            options={[
              { value: "gfm", label: "GFM" },
              { value: "commonmark", label: "CommonMark" }
            ]}
            onChange={(v) => ui.setMarkdownFlavor(v as MarkdownFlavor)}
          />
        }
      />
    </>
  )
})

const KEYBOARD_SHORTCUTS: { keys: string[]; label: React.ReactNode }[] = [
  { keys: ["j", "k"], label: <>Next / previous <b>file or comment</b></> },
  { keys: ["⌘K"], label: <><b>Command palette</b></> },
  { keys: ["g"], label: <>Jump to <b>file</b></> },
  { keys: ["⌘⏎"], label: <><b>Submit</b> comment</> },
  { keys: ["/"], label: <><b>Filter</b> files</> },
  { keys: ["r"], label: <><b>Reply</b></> },
  { keys: ["e"], label: <><b>Resolve</b></> },
  { keys: ["[", "]"], label: <>Previous / next <b>round</b></> }
]

function KeyboardPane() {
  return (
    <>
      <PaneHeader
        title="Keyboard"
        lede="A read-only reference. The same shortcuts work everywhere in a review."
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        {KEYBOARD_SHORTCUTS.map((row, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <span className="inline-flex min-w-14 items-center gap-1">
              {row.keys.map((key, j) => (
                <span key={j} className="inline-flex items-center gap-1">
                  {j > 0 && <span className="text-[11px] text-faint">/</span>}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </span>
            <span className="text-[12.5px] text-text">{row.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-soft px-1.5 py-px font-mono text-[10.5px] font-semibold text-muted-foreground ring-1 ring-inset ring-line">
      {children}
    </kbd>
  )
}

function AboutPane() {
  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-[38px] place-items-center rounded-[11px] bg-blue text-[19px] font-black text-on-accent shadow-[inset_0_0.5px_0_oklch(100%_0_0/0.4),0_0_14px_var(--accent-soft)]"
        >
          S
        </span>
        <span className="text-[22px] font-bold tracking-[-0.02em] text-heading">
          Suikou
        </span>
      </div>
      <p className="max-w-[56ch] text-[14px] leading-[1.55] text-text">
        <span className="font-semibold tracking-[0.02em] text-heading">推敲 (Suikou)</span>{" "}
        <span className="text-faint">
          the deliberation over the exact word to use, from the push versus knock story.
        </span>
      </p>
      <div className="h-px bg-line" />
      <dl className="flex flex-col gap-px">
        <AboutRow k="Version" v="Suikou 0.1.0" mono />
        <AboutRow k="Runtime" v="Local, server-authoritative review runtime" />
      </dl>
      <p className="max-w-[56ch] text-[11.5px] leading-[1.5] text-faint">
        A quiet desk for reading an agent's diff, round after round, until the word is
        exactly right.
      </p>
    </div>
  )
}

function AboutRow({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-line py-1.5 first:border-t-0">
      <dt className="w-24 shrink-0 text-[11px] font-semibold tracking-[0.02em] text-faint">
        {k}
      </dt>
      <dd
        className={cn(
          "text-[12.5px] tracking-[-0.005em] text-text",
          mono && "font-mono tabular-nums"
        )}
      >
        {v}
      </dd>
    </div>
  )
}

// A small segmented control that reuses the flat-solid button aesthetic. Fits
// on one row on desktop; on the mobile sheet, `touch` grows it to a 44px hit
// area with a larger label so it reads as a real iOS control.
function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  touch = false
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
  touch?: boolean
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 border border-line bg-canvas/70 shadow-inner",
        touch ? "rounded-[9px] p-[3px]" : "rounded-lg p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 cursor-pointer font-medium tracking-[-0.005em] transition-colors duration-150",
              touch
                ? "h-[34px] rounded-[6px] px-[14px] text-[13px]"
                : "h-[22px] rounded-md px-[11px] text-[11.5px]",
              selected
                ? "bg-surface text-heading shadow-[inset_0_0.5px_0_var(--edge-top),0_1px_2px_rgba(0,0,0,0.35)]"
                : "text-muted-foreground hover:text-text"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// Pill-track toggle switch. Flat accent fill when on, hairline off. Sized for
// touch on the mobile sheet through the `touch` prop.
function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
  touch = false
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  ariaLabel: string
  touch?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative cursor-pointer rounded-full transition-colors duration-150",
        "border border-line-strong shadow-inner",
        checked
          ? "bg-blue shadow-[inset_0_0_0_0.5px_var(--accent-edge),0_0_12px_var(--accent-soft)]"
          : "bg-canvas/80",
        touch ? "h-[31px] w-[51px]" : "h-6 w-[42px]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] block rounded-full transition-[left,background-color] duration-150",
          "shadow-[0_1px_3px_rgba(0,0,0,0.5),inset_0_0.5px_0_rgba(255,255,255,0.4)]",
          checked ? "bg-on-accent" : "bg-muted",
          touch
            ? checked
              ? "left-[23px] size-[25px]"
              : "left-[3px] size-[25px]"
            : checked
              ? "left-[21px] size-[18px]"
              : "left-[3px] size-[18px]"
        )}
      />
    </button>
  )
}

function ThemePicker({
  value,
  onChange,
  touch = false
}: {
  value: ThemeName
  onChange: (t: ThemeName) => void
  touch?: boolean
}) {
  const light = THEMES.filter((t) => !THEME_CODE[t].dark)
  const dark = THEMES.filter((t) => THEME_CODE[t].dark)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="pill"
            size="sm"
            className={cn(
              "gap-2 rounded-[9px]",
              touch
                ? "h-[38px] w-full justify-between pl-3 pr-3"
                : "h-[30px] pl-3 pr-2.5"
            )}
          >
            <span className={cn("truncate font-medium tracking-[-0.005em]", touch ? "text-[15px]" : "text-[13px]")}>
              {THEME_LABELS[value]}
            </span>
            <ChevronDown size={touch ? 16 : 12} className="shrink-0 text-muted-foreground opacity-70" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className={cn("max-h-[326px] overflow-auto", touch ? "w-[280px]" : "w-[234px]")}>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as ThemeName)}
        >
          <DropdownMenuLabel className="text-[10px] font-bold tracking-[0.08em] text-faint uppercase">
            Light
          </DropdownMenuLabel>
          {light.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              {THEME_LABELS[t]}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-bold tracking-[0.08em] text-faint uppercase">
            Dark
          </DropdownMenuLabel>
          {dark.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              {THEME_LABELS[t]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Mobile sheet: iOS-settings style grouped list. All panes visible together
// (no rail), since a phone has room to scroll and a section rail would waste
// tap area.
const MobileSheet = observer(function MobileSheet() {
  const ui = uiStore
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-panel/95 px-4 backdrop-blur-md">
        <DialogPrimitive.Title className="text-[18px] font-semibold tracking-[-0.02em] text-heading">
          Settings
        </DialogPrimitive.Title>
        <span className="flex-1" />
        <DialogPrimitive.Close render={<Button size="sm" className="h-8" />}>
          Done
        </DialogPrimitive.Close>
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-auto px-4 py-4 pb-8">
        <SheetGroup title="Appearance">
          <SheetStackedRow label="Theme">
            <ThemePicker touch value={ui.theme} onChange={(t) => ui.setTheme(t)} />
          </SheetStackedRow>
          <SheetStackedRow label="Density">
            <Segmented
              touch
              className="w-full"
              value={ui.density}
              options={[
                { value: "tight", label: "Compact" },
                { value: "normal", label: "Comfortable" },
                { value: "loose", label: "Loose" }
              ]}
              onChange={(v) => ui.setDensity(v as Density)}
            />
          </SheetStackedRow>
          <SheetInlineRow label="Code wrap" sub="Soft-wrap long source lines">
            <Switch
              touch
              checked={ui.wrapLines}
              onCheckedChange={(v) => ui.setWrapLines(v)}
              ariaLabel="Code wrap"
            />
          </SheetInlineRow>
        </SheetGroup>

        <SheetGroup title="Review defaults">
          <SheetStackedRow label="Comment layout">
            <Segmented
              touch
              className="w-full"
              value={ui.commentMode}
              options={[
                { value: "inline", label: "Inline" },
                { value: "side", label: "Side" }
              ]}
              onChange={(v) => ui.setCommentMode(v as CommentMode)}
            />
          </SheetStackedRow>
          <SheetStackedRow label="Diff view">
            <Segmented
              touch
              className="w-full"
              value={ui.diffLayout}
              options={[
                { value: "unified", label: "Unified" },
                { value: "side", label: "Side by side" }
              ]}
              onChange={(v) => ui.setDiffLayout(v as DiffLayout)}
            />
          </SheetStackedRow>
          <SheetStackedRow label="File mode">
            <Segmented
              touch
              className="w-full"
              value={ui.fileDisplayMode}
              options={[
                { value: "single", label: "Single file" },
                { value: "all", label: "All files" }
              ]}
              onChange={(v) => ui.setFileDisplayMode(v as FileDisplayMode)}
            />
          </SheetStackedRow>
          <SheetStackedRow label="Markdown flavor">
            <Segmented
              touch
              className="w-full"
              value={ui.markdownFlavor}
              options={[
                { value: "gfm", label: "GFM" },
                { value: "commonmark", label: "CommonMark" }
              ]}
              onChange={(v) => ui.setMarkdownFlavor(v as MarkdownFlavor)}
            />
          </SheetStackedRow>
        </SheetGroup>

        <SheetGroup title="Reference">
          <div className="p-4">
            <KeyboardPane />
          </div>
          <div className="border-t border-line p-4">
            <AboutPane />
          </div>
        </SheetGroup>
      </div>
    </>
  )
})

function SheetGroup({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1.5 text-[11px] font-bold tracking-[0.10em] text-faint uppercase">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--elev-1)]">
        {children}
      </div>
    </section>
  )
}

function SheetStackedRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
      <span className="text-[15px] font-medium tracking-[-0.01em] text-heading">
        {label}
      </span>
      <div className="w-full">{children}</div>
    </div>
  )
}

function SheetInlineRow({
  label,
  sub,
  children
}: {
  label: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 min-h-14">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium tracking-[-0.01em] text-heading">
          {label}
        </div>
        {sub && <div className="text-[12px] leading-snug text-faint">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
