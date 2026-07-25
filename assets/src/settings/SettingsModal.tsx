import { useEffect, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { Bell, Check, Info, Palette, SlidersHorizontal, X } from "lucide-react"

import * as push from "../lib/push"
import { BrandMark, BRAND_SERIF } from "../brand/BrandMark"
import { Dialog, DialogTitle } from "../components/ui/dialog"
import { Segmented } from "../components/ui/segmented"
import { Select } from "../components/ui/select"
import { Switch } from "../components/ui/switch"
import { uiStore, type CommentDisplayMode, type Density, type DiffStyle, type FileRange, type MonoSize } from "../stores/ui-store"
import { THEME_CODE, THEME_LABELS, THEMES, type ThemeName } from "../themes"

const THEME_GROUPS = [
  {
    label: "Light",
    options: THEMES.filter((t) => !THEME_CODE[t].dark).map((t) => ({ value: t, label: THEME_LABELS[t] })),
  },
  {
    label: "Dark",
    options: THEMES.filter((t) => THEME_CODE[t].dark).map((t) => ({ value: t, label: THEME_LABELS[t] })),
  },
]

type Pane = "appearance" | "review" | "notifications" | "about"

const NAV: { id: Pane; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={16} aria-hidden /> },
  { id: "review", label: "Review defaults", icon: <SlidersHorizontal size={16} aria-hidden /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} aria-hidden /> },
  { id: "about", label: "About", icon: <Info size={16} aria-hidden /> },
]

/** Settings modal: a centered panel over the dimmed board (a bottom sheet on
 * phones). Preferences apply live, so the footer carries only a Done action. */
export const SettingsModal = observer(function SettingsModal() {
  const [pane, setPane] = useState<Pane>("appearance")
  const open = uiStore.settingsOpen
  const close = () => uiStore.setSettingsOpen(false)

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
            {NAV.map((item) => {
              const active = item.id === pane
              return (
                <button
                  key={item.id}
                  onClick={() => setPane(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-[36px] shrink-0 items-center gap-[9px] rounded-ctrl px-3 text-sm font-medium ${
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
            {pane === "notifications" && <NotificationsPane />}
            {pane === "about" && <AboutPane />}
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

const AppearancePane = observer(function AppearancePane() {
  return (
    <div className="flex flex-col gap-6">
      <PaneHead
        title="Appearance"
        lede="How Suikou looks while you read code and prose for a stretch. Applies across every project."
      />
      <Row title="Theme" sub="Syntax and surface palette. 15 built in, light and dark.">
        <Select
          aria-label="Theme"
          value={uiStore.theme}
          onValueChange={(v) => uiStore.setTheme(v as ThemeName)}
          groups={THEME_GROUPS}
        />
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
        <Switch
          aria-label="Code wrap"
          checked={uiStore.codeWrap}
          onCheckedChange={(v) => uiStore.setCodeWrap(v)}
        />
      </Row>
      <Row title="Mono size" sub="Font size for code, diffs, and anchor readouts.">
        <Segmented<MonoSize>
          value={uiStore.monoSize}
          onChange={(v) => uiStore.setMonoSize(v)}
          options={[
            ["small", "Small"],
            ["default", "Default"],
            ["large", "Large"],
            ["xlarge", "XL"],
          ]}
        />
      </Row>
      <Row title="Your avatar" sub="An emoji shown on your comments and replies instead of the default icon.">
        <div className="flex items-center gap-2">
          <input
            aria-label="Your avatar emoji"
            value={uiStore.userEmoji}
            onChange={(e) => uiStore.setUserEmoji(e.target.value)}
            placeholder="🙂"
            className="h-[34px] w-[52px] rounded-ctrl border border-hair-strong bg-canvas text-center text-lg focus:border-accent-edge focus:outline-none"
          />
          {uiStore.userEmoji && (
            <button
              type="button"
              onClick={() => uiStore.setUserEmoji("")}
              className="inline-flex h-[34px] items-center rounded-ctrl px-2.5 text-xs font-medium text-muted hover:bg-soft hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </Row>
    </div>
  )
})

const ReviewDefaultsPane = observer(function ReviewDefaultsPane() {
  return (
    <div className="flex flex-col gap-6">
      <PaneHead title="Review defaults" lede="How new reviews open until you change them per review." />
      <Row title="File layout" sub="Read one file at a time, or stack every file in one scroll. Desktop only.">
        <Segmented<FileRange>
          value={uiStore.fileRange}
          onChange={(v) => uiStore.setFileRange(v)}
          options={[
            ["single", "Single"],
            ["stacked", "Stacked"],
          ]}
        />
      </Row>
      <Row title="Comments" sub="Default placement for review comments on desktop. Mobile stays inline.">
        <Segmented<CommentDisplayMode>
          value={uiStore.commentDisplay}
          onChange={(v) => uiStore.setCommentDisplay(v)}
          options={[
            ["inline", "Inline"],
            ["side", "Side"],
            ["hidden", "Hidden"],
          ]}
        />
      </Row>
      <Row title="Diff view" sub="Unified stacks additions under deletions; split shows old and new side by side.">
        <Segmented<DiffStyle>
          value={uiStore.diffStyle}
          onChange={(v) => uiStore.setDiffStyle(v)}
          options={[
            ["unified", "Unified"],
            ["split", "Split"],
          ]}
        />
      </Row>
      <Row title="Word diff" sub="Highlight the exact words that changed inside paired del/add lines.">
        <Switch
          aria-label="Word diff"
          checked={uiStore.wordDiff}
          onCheckedChange={(v) => uiStore.setWordDiff(v)}
        />
      </Row>
    </div>
  )
})

const NOTIF_HINT: Record<"unsupported" | "denied", string> = {
  unsupported:
    "Needs a secure context. Over the tailnet, front the app with HTTPS (tailscale serve); plain HTTP and the dev server carry no push.",
  denied: "Blocked. Allow notifications for this site in your browser settings, then reload.",
}

function NotificationsPane() {
  const [reason, setReason] = useState(push.unavailableReason())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    push.isSubscribed().then((subscribed) => {
      if (active) setEnabled(subscribed)
    })
    return () => {
      active = false
    }
  }, [])

  const onChange = async (next: boolean) => {
    setBusy(true)
    try {
      if (next) {
        setEnabled(await push.enable())
      } else {
        await push.disable()
        setEnabled(false)
      }
    } finally {
      setReason(push.unavailableReason())
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PaneHead
        title="Notifications"
        lede="Let an agent ping you to come review. Opt in per device — the subscription lives in this browser."
      />
      <Row
        title="Review notifications"
        sub={
          reason
            ? NOTIF_HINT[reason]
            : "Show a system notification when an agent asks you to review a change."
        }
      >
        <Switch
          aria-label="Review notifications"
          checked={enabled}
          disabled={reason !== null || busy}
          onCheckedChange={onChange}
        />
      </Row>
    </div>
  )
}

function AboutPane() {
  return (
    <div className="flex flex-col gap-4">
      <PaneHead title="About" lede="" />
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <div className="text-base font-bold text-ink">すいこう Suikou</div>
          <div className="text-xs text-muted">Deliberate review of every change.</div>
        </div>
      </div>
      <p className="max-w-[52ch] text-xs leading-[1.5] text-muted">
        推敲 is the act of weighing the exact word to use. Suikou turns review into a real workbench:
        read closely, anchor comments, set a verdict per file, submit a round, iterate.
      </p>
      <figure className="max-w-[52ch] rounded-[10px] border border-hair bg-soft px-4 py-3">
        <blockquote
          className="text-[15px] leading-[1.9] text-ink"
          style={{ fontFamily: BRAND_SERIF }}
        >
          <div>鳥宿池邊樹，</div>
          <div>
            僧<span className="text-accent-bright font-medium">敲</span>月下門。
          </div>
        </blockquote>
        <figcaption className="mt-2 text-xs leading-[1.5] text-muted">
          賈島《題李凝幽居》。初擬「
          <span className="text-accent-bright">推</span>」字，復欲作「
          <span className="text-accent-bright">敲</span>
          」，煉之未定，引手作勢，「推敲」遂出於此。
        </figcaption>
      </figure>
    </div>
  )
}

function PaneHead({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-base font-bold tracking-[-0.015em] text-ink">{title}</h3>
      {lede && <p className="max-w-[52ch] text-xs leading-[1.45] text-muted">{lede}</p>}
    </div>
  )
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-t border-hair pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs leading-[1.4] text-muted">{sub}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
