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
- The accent is a **solid** fill. The primary button (Submit, New, Done, send)
  and selection rails use a flat `var(--accent)`, no gradient. `--accent-grad`
  and `--accent-grad-v` are kept as aliases resolving to `var(--accent)` so old
  references stay solid; do not reintroduce a multi-stop gradient there.
- soft fills `--accent-soft: teal / 0.14`, `--accent-softer: / 0.08`, edge `/ 0.34`
- **No gradient fills on buttons or controls.** Buttons, toolbars, segmented
  controls, and the primary action are flat solids. The only gradients left in
  the system are the ambient `--desk` background wash and the 1px hairline
  divider fades, both structural, neither an element fill. No `background-clip:
  text` either.

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
  not a gear), the primary Submit (a solid accent fill), and Review. Round
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

## Suikou Light (light theme)

The same system, lit. Suikou Light keeps every structural choice (restrained
strategy, accent reserved for action/selection/focus, semantics paired with
glyphs, hairline rings instead of stripes, monochrome icons) and only swaps the
surfaces and ink: a cool off-white desk, near-white panels, dark cool-tinted
ink, and accent/semantic colors pushed darker and slightly more saturated so
they hold contrast on white. The reading surface is near-white; code and diffs
carry a light syntax theme. The desk glow is a faint cool wash, not a dark one;
elevation is soft gray shadow with a white top rim, never a dark inner edge.

Use this `:root` token block for light-theme files (it mirrors every Suikou Dark
variable name, so the same component CSS works unchanged). All AA: muted ink-3
holds >= 4.5:1 on the near-white panels; accent glyph/text colors are dark
enough to read on white and on their soft fills.

```css
:root {
  color-scheme: light;
  --bg-0: oklch(96.5% 0.006 240);   /* desk / page */
  --bg-1: oklch(98% 0.005 240);     /* window */
  --bg-2: oklch(99.4% 0.003 240);   /* panels, cards, threads */
  --bg-3: oklch(93.5% 0.008 240);   /* hover */
  --bg-4: oklch(90.5% 0.010 240);   /* raised control */
  --editor-bg: oklch(99.2% 0.003 240); /* reading surface */

  --ink-0: oklch(26% 0.020 252);    /* primary text */
  --ink-1: oklch(40% 0.018 250);    /* secondary */
  --ink-2: oklch(50% 0.016 248);    /* tertiary / labels */
  --ink-3: oklch(52% 0.015 248);    /* muted, AA-safe on bg-2 */

  --cyan: oklch(60% 0.13 205);
  --teal: oklch(54% 0.13 222);
  --blue: oklch(50% 0.16 248);
  --accent: oklch(53% 0.14 226);
  --accent-strong: oklch(47% 0.15 232);
  --accent-bright: oklch(46% 0.16 232); /* glyphs/text: dark enough for AA on white */
  --accent-grad:   var(--accent);
  --accent-grad-v: var(--accent);
  --accent-soft:   oklch(54% 0.13 222 / 0.12);
  --accent-softer: oklch(54% 0.13 222 / 0.07);
  --accent-edge:   oklch(54% 0.13 222 / 0.30);
  --on-accent:     oklch(99% 0.005 230); /* text on the solid accent button */

  --amber:      oklch(56% 0.14 64);
  --amber-deep: oklch(50% 0.14 58);
  --amber-soft: oklch(72% 0.13 70 / 0.18);
  --amber-edge: oklch(60% 0.14 64 / 0.32);

  --approve:      oklch(52% 0.15 150);
  --approve-soft: oklch(62% 0.15 150 / 0.15);
  --approve-edge: oklch(54% 0.15 150 / 0.32);
  --request:      oklch(53% 0.20 25);
  --request-soft: oklch(62% 0.20 25 / 0.13);
  --request-edge: oklch(55% 0.20 25 / 0.32);
  --neutral-v:    var(--ink-2);
  --neutral-soft: oklch(50% 0.01 246 / 0.10);

  --type-fix:       oklch(53% 0.20 25);
  --type-fix-soft:  oklch(62% 0.20 25 / 0.13);
  --type-fix-edge:  oklch(55% 0.20 25 / 0.34);
  --type-ask:       oklch(50% 0.16 248);
  --type-ask-soft:  oklch(58% 0.15 248 / 0.13);
  --type-ask-edge:  oklch(52% 0.16 248 / 0.34);
  --type-note:      oklch(50% 0.015 248);
  --type-note-soft: oklch(50% 0.01 246 / 0.12);
  --type-note-edge: oklch(50% 0.01 246 / 0.26);

  --diff-add:     oklch(72% 0.13 150 / 0.20);
  --diff-add-gut: oklch(66% 0.14 150 / 0.32);
  --diff-add-ink: oklch(45% 0.15 150);
  --diff-del:     oklch(74% 0.14 25 / 0.18);
  --diff-del-gut: oklch(68% 0.16 25 / 0.30);
  --diff-del-ink: oklch(50% 0.19 25);

  --syn-key:  oklch(46% 0.19 300);
  --syn-fn:   oklch(45% 0.15 250);
  --syn-str:  oklch(44% 0.13 150);
  --syn-num:  oklch(50% 0.13 55);
  --syn-atom: oklch(46% 0.13 200);
  --syn-com:  oklch(60% 0.020 240);
  --syn-mod:  oklch(48% 0.13 30);
  --syn-punc: oklch(45% 0.015 248);

  --hair:        oklch(30% 0.02 250 / 0.10);
  --hair-strong: oklch(30% 0.03 248 / 0.16);
  --edge-top:    oklch(100% 0 0 / 0.85);
  --edge-top-2:  oklch(100% 0 0 / 0.55);

  --panel-spec: inset 0 1px 0 var(--edge-top), inset 0 0 0 0.5px var(--edge-top-2);
  --shadow-win:  0 1px 0 var(--edge-top) inset, 0 2px 6px oklch(50% 0.02 250 / 0.10),
                 0 16px 40px oklch(50% 0.02 250 / 0.12), 0 40px 80px oklch(48% 0.02 250 / 0.10);
  --shadow-pop:  var(--panel-spec), 0 4px 14px oklch(50% 0.02 250 / 0.14), 0 22px 50px oklch(48% 0.02 250 / 0.16);
  --shadow-float: 0 2px 8px oklch(50% 0.02 250 / 0.12), 0 12px 30px oklch(48% 0.02 250 / 0.14);
  --shadow-card: 0 1px 2px oklch(50% 0.02 250 / 0.10), inset 0 0.5px 0 var(--edge-top-2);

  --desk:
    radial-gradient(70% 55% at 14% 8%, oklch(80% 0.05 200 / 0.45) 0%, transparent 60%),
    radial-gradient(64% 60% at 92% 12%, oklch(80% 0.05 245 / 0.40) 0%, transparent 58%),
    radial-gradient(90% 80% at 70% 108%, oklch(82% 0.04 270 / 0.35) 0%, transparent 60%),
    linear-gradient(160deg, oklch(97% 0.006 240), oklch(95% 0.008 238));

  --r-win: 16px; --r-panel: 13px; --r-ctrl: 9px; --r-pill: 999px;
}
```

Buttons and controls are flat solids in both skins (no gradient). Dark buttons
sit one step up from the panel; light buttons sit one step down from white (a
solid near-white, e.g. `oklch(99% 0.003 240)`), each with hover one step darker
and a hairline ring, so a control reads as raised without a gradient.

## Built-in themes

Suikou Dark and Suikou Light above are the two reference token sets this doc
specifies, and what the mockups render in. The shipping app does not hardcode
one palette: it resolves colors from whichever `[data-theme]` is active, chosen
in Settings. The list of themes is owned by `assets/src/themes.ts` (that file is
the source of truth; keep this section in sync with it). Each theme is inherently
light or dark, so there is no separate light/dark switch, the chosen theme
carries it. Syntax colors come from a Shiki source theme extracted into
`--shiki-*` (see `assets/src/shiki-themes.css`); tokenization stays
theme-independent via the css-variables theme, so switching `[data-theme]`
recolors in pure CSS with no re-tokenize.

The 13 built-in themes, grouped by light and dark (label, `[data-theme]` value):

- Light: GitHub Light (`github`), Solarized Light (`solarized`), Catppuccin Latte
  (`catppuccin`), Gruvbox Light (`gruvbox`), Tokyo Night Day (`tokyo-day`).
- Dark: Tokyo Night (`tokyo`), Tokyo Night Storm (`tokyo-storm`), Tokyo Night Moon
  (`tokyo-moon`), Dracula (`dracula`), Nord (`nord`), One Dark Pro (`onedark`),
  Catppuccin Mocha (`catppuccin-mocha`), Rosé Pine (`rose-pine`).

The Settings **Theme** control is a picker over this list, grouped Light then
Dark, with the current theme checked (not a Dark/Light/System toggle). Add a
theme by extending `themes.ts` and its palette in `shiki-themes.css`; the picker
should render the new entry with no other change.

Everything else in this doc, the structural grammar, components, spacing,
motion, and the bans, is **theme-independent** and holds across all themes. A
theme changes surface and ink and syntax colors; it never changes the layout,
the component vocabulary, or the rules. When designing, treat Suikou Dark and
Suikou Light as the two ends to check against; if a component reads well in both,
it will read well in every built-in theme.
