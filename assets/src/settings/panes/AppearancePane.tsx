import { observer } from "mobx-react-lite"

import { PaneHead, Row } from "./pane-parts"
import { Segmented } from "../../components/ui/segmented"
import { Select } from "../../components/ui/select"
import { Switch } from "../../components/ui/switch"
import { uiStore, type Density, type MonoSize } from "../../stores/ui-store"
import { THEME_CODE, THEME_LABELS, THEMES, type ThemeName } from "../../themes"

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

export const AppearancePane = observer(function AppearancePane() {
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
