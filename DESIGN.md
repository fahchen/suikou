# Design

The visual system for Suikou. Its name is **Suikou Dark**: a near-black,
cool-tinted developer workbench where syntax-highlighted code and anchored
comments are the only saturated things on screen, and every control is a quiet
slab of dark glass. This file is the source of truth for tokens; UI work reads
from it so the product stays one coherent surface.

## Theme

Dark, and deliberately so. The scene: a developer reading an agent's diff for
the third round at night, on a wide display, switching between code, prose, and
a rendered page, for an hour at a stretch. A dark, low-emission surface keeps the
syntax colors and the green/red of a diff legible and lets them carry meaning,
while the chrome around them stays out of the retina's way. The background is
never flat black: it is a charcoal tinted toward cool blue (hue ~230), lit by a
faint teal/blue glow so panels read as glass over depth, not paint on a wall.

## Color

Strategy: **restrained**. Tinted near-black neutrals carry the whole surface; a
single cyan-to-teal-to-blue accent appears sparingly (primary action, selection,
focus), amber marks numbers and "attention" states, and green/red are reserved
for verdicts and diffs. Saturated color is information, never decoration. OKLCH
only; never `#000`/`#fff`; chroma drops as lightness approaches the extremes.

### Surfaces (cool-tinted charcoals, hue ~228-236)

- `--bg-0: oklch(14.5% 0.012 235)` app base
- `--bg-1: oklch(16.5% 0.013 232)`
- `--bg-2: oklch(18.5% 0.014 230)` panels, cards
- `--bg-3: oklch(21% 0.015 228)` hover, controls
- `--bg-4: oklch(24% 0.016 226)` raised control
- `--editor-bg: oklch(15.5% 0.012 234)` reading surface

### Ink (text), warm-neutral on cool ground

- `--ink-0: oklch(93% 0.006 230)` primary text
- `--ink-1: oklch(80% 0.008 230)` secondary
- `--ink-2: oklch(66% 0.009 232)` tertiary / labels
- `--ink-3: oklch(61% 0.010 234)` muted, held at AA (>= 4.5:1 on bg-2/bg-3); do
  not push muted text below this for style

### Accent (cyan -> teal -> blue)

- `--cyan: oklch(82% 0.11 195)`, `--teal: oklch(74% 0.12 215)`, `--blue: oklch(70% 0.12 230)`
- `--accent: var(--teal)`; `--accent-bright: oklch(86% 0.10 198)` for on-dark glyphs
- `--accent-grad: linear-gradient(110deg, cyan 0%, teal 50%, blue 100%)` for the
  primary button and selection rails only
- soft fills `--accent-soft: teal / 0.14`, `--accent-softer: / 0.08`, edge `/ 0.34`
- Gradient is a fill, never text. No `background-clip: text`.

### Semantic

- amber (numbers, attention, outdated/drifted/refs-moved): `--amber: oklch(80% 0.12 78)`, deep `oklch(72% 0.13 70)`
- approve (verdict, success): `--approve: oklch(76% 0.15 152)`
- request changes (verdict, danger): `--request: oklch(70% 0.17 22)`
- comment types: fix_required = red `oklch(72% 0.17 22)`, needs_answer = blue `oklch(74% 0.13 240)`, note = neutral `oklch(68% 0.01 235)`
- diff: add `oklch(62% 0.10 150 / 0.16)` bg + ink `oklch(82% 0.14 150)`; del `oklch(60% 0.13 22 / 0.16)` bg + ink `oklch(80% 0.14 22)`
- Every semantic color is paired with a glyph or label (A/M/D, type pill, +/-
  sign) so meaning survives without color.

### Syntax

key `oklch(76% 0.13 320)` (violet), fn `oklch(80% 0.11 235)` (blue), str
`oklch(82% 0.12 150)` (green), num `oklch(82% 0.11 60)` (amber), atom
`oklch(82% 0.11 195)` (cyan), comment `oklch(58% 0.02 200)` (muted), module
`oklch(80% 0.10 30)`, punctuation `oklch(70% 0.01 235)`.

### Hairlines and edges

Borders are light at very low alpha, not dark lines: `--hair: oklch(80% 0.02 230 / 0.10)`,
`--hair-strong: / 0.18`; top inner edge `--edge-top: oklch(90% 0.03 220 / 0.16)`
gives slabs a lit upper rim.

## Typography

- UI: `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", "Inter", sans-serif`
- Code and all diff/anchor/stat readouts: `"SF Mono", ui-monospace, "JetBrains Mono", "Menlo", monospace`
- Body line-height 1.42, letter-spacing -0.004em; code line-height ~1.7.
- Hierarchy by scale + weight, not by color: section labels are small (10-11px),
  uppercase, tracked, in `--ink-3`; titles are 13px/640; numbers are tabular
  (`font-variant-numeric: tabular-nums`) and often in amber.
- Cap prose (markdown preview) at 65-75ch.

## Elevation and materials

Depth comes from layered low-alpha shadows plus a lit top edge, over a faint
desk glow, not from blur. Window shadow stacks four layers from a 1px top rim to
a 40px ambient. Popovers and floats use lighter versions. Glassmorphism is not a
default; panels are opaque dark slabs with a hairline ring and an inner top
highlight (`--panel-spec`). The app sits on a `--desk` radial-gradient glow
(teal at top-left, blue at top-right, indigo at bottom) over the charcoal base.

## Radii and spacing

`--r-win: 16px` (app window), `--r-panel: 13px` (panels/threads), `--r-ctrl: 9px`
(buttons/inputs), `--r-pill: 999px` (chips, verdicts, type pills). Vary padding
for rhythm; do not pad everything equally. Avoid card-in-card; nested cards are
wrong.

## Components

- **Toolbar**: a single 50px bar. Left: collapse-navigator, then a breadcrumb
  button (`project > review`, or for git_diff a Diff badge + `base..head` refs).
  Right cluster, kept minimal: round selector, display options (a sliders glyph,
  not a gear), the primary Submit (the only gradient surface), and Review. Round
  compare and resnapshot live inside the round menu, not as standalone buttons.
- **Navigator rows**: change-status glyph (A/M/D), an optional unread/blocker
  dot, a monochrome file-type glyph (Elixir drop, test beaker, code brackets,
  picture, doc; not color emoji), the name, then a trailing slot for a comment
  count or, in a diff review, `+N / -M` stats. Selected row is a full accent
  background fill with a hairline ring, never a left stripe.
- **Editor**: a file head (path, view toggle, per-file verdict chip), then the
  content. Source uses a line gutter with a hover-only add-comment affordance.
  Markdown previews block by block. HTML renders in a light sandboxed iframe
  (the one bright surface, because it is the user's content) with a comment/
  interactive toggle and a 10%-200% zoom. Diffs render unified or side-by-side.
- **Comment thread**: a dark slab tinted faintly by type (fix/ask/note), with a
  type pill, an anchor line, body, agent replies (a bot avatar, an optional
  `>_` command pill, an "Applied +N/-M" note), a reply box, and Resolve + react.
  Threads appear inline at their line, or, in side mode, in a right rail aligned
  to lines and collapsible to one line when dense. The same comment is never
  shown in both places.
- **Pills and chips**: verdict chips (approve/request/comment/none) and comment
  type pills are pill-radius, soft-filled, with an inset ring in their color.
- **Status bar**: a 29px bar that carries current context only (file, line,
  view, round, and a mode note), plus the single connection indicator at the
  far right. Progress counts live in the navigator meter, not here.

## Motion

Restrained. Ease out with exponential curves (ease-out-quart/quint/expo); no
bounce, no elastic, no celebration. Do not animate layout properties. The only
ambient motion is a slow spinner for reconnecting/loading. Honor
prefers-reduced-motion.

## Reinforced bans (in addition to the shared impeccable bans)

- No left/right colored side-stripes anywhere (selection, comment cards, quotes,
  diff rows). Use full background fills with a hairline ring instead.
- No color emoji as file or UI icons. Monochrome line glyphs only. (Reaction
  emoji on a comment are the one allowed exception, because reactions are
  literally emoji.)
- No persistent right-hand inspector. Review roll-up and submit are toolbar
  popovers; the right column exists only as the side comment rail.
- No status fact shown in more than one place at once.
- No em dashes and no pure `#000`/`#fff` in any committed file.
