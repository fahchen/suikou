# Fidelity ledger — pass 3: 1:1 restoration of every mockup state (impeccable)

Passes 1-2 raised structure + overflow. The app is still NOT 100% faithful. This
pass matches the app **1:1** to the mockups in `design/pages/`, state by state,
using the **impeccable** skill (load `~/.claude/skills/impeccable/reference/product.md`
and apply its laws). Screenshot EVERY mockup state and reproduce it exactly:
palette, spacing, typography, radii, borders, shadows/glow, control shapes,
icons, and each interaction state — at desktop AND mobile, light AND dark.

## 0. FOUNDATION — the "Suikou Dark / Light" palette (do this FIRST)

The mockups render in a specific **Suikou Dark** direction: near-black charcoal
over a faint teal/blue glow, dark glass panels with hairline borders, and a
**cyan→teal→blue gradient accent used sparingly** plus amber for numbers and
green/red for diff rows. The real app currently defaults to a code theme
(`github` light / Tokyo Night) whose accent is plain blue — so it does NOT read
as the mockup.

Fix: add **`suikou-dark`** and **`suikou-light`** themes (in `assets/src/themes.ts`,
`shiki-themes.css`, and the `--color-*` blocks in `index.css`) whose palette
matches the mockups exactly (accent = the mockup's teal/cyan, surfaces = the
mockup's charcoal, the teal/blue ambient glow, amber numbers, green/red diff).
Make **`suikou-dark` the default** theme (ui-store `theme` default + first in the
picker). Keep the 13 code themes available in the picker. `DESIGN.md` already
names these token sets — align to it. This is the single biggest fidelity gap;
land it before per-state work so every screenshot below is compared in the right palette.

## How to work (every iteration)

1. Read this file. Pick the FIRST item still `[ ]` or `[~]`; mark it `[~]`.
2. Screenshot with **chrome-devtools-mcp ONLY** (`new_page` / `navigate_page` /
   `resize_page` / `take_screenshot`). **NEVER `agent-browser` — its screenshot
   hangs.** The dev app runs at `http://localhost:4710` (do NOT restart it;
   `cd assets && bun run build` after edits, then hard-reload). Open the mockup
   HTML (`file://…`) and the matching app route, at ~1440×900 AND ~390×844.
   The review storyboard has a top nav (Empty · Source · Composer · Side rail ·
   Preview · Diff · HTML · All files · Submit · Compare · System) — each is a
   state group; step through them (click the nav link, it jumps to `#sNN`).
3. Diff element-by-element and **reproduce 1:1**. Use the app's `--color-*`
   tokens (no hardcoded hex / `#000` / `#fff`, no button gradients except the
   ambient glow the mockup itself uses, no side-stripe borders, monochrome icons).
   Keep the mockup's structure; match its exact values.
4. Re-screenshot and confirm the app is indistinguishable from the mockup at both
   widths, light and dark.
5. Gate: `cd assets && bun run typecheck && bun run test && bun run build` — all
   green (bun only). Don't hand-edit generated files. Mark `[x]` (or `[~]` + a
   precise note) and commit (small, English, no unrelated churn).

Don't restart the dev server or touch the DB; use the seeded IDs below.

## Surfaces — match EVERY state

Legend: `[ ]` todo, `[~]` in progress, `[x]` 1:1 with the mockup (all its states) + green + committed.

- [x] **0. Suikou Dark/Light palette** (see section 0). themes.ts, shiki-themes.css, index.css, ui-store default.

- [ ] **1. Projects launcher** — every state in `design/pages/projects/suikou-dark.html`
  (default, populated, empty "No projects yet", "Open a review to start") + `suikou-light.html`
  + mobile (`suikou-dark-mobile.html` / `suikou-light-mobile.html`).
  Route: `http://localhost:4710/` · `assets/src/review/ProjectBoard.tsx`.

- [ ] **2. Settings modal** — every pane/state in `design/pages/settings/suikou-dark.html`
  (Appearance, Review defaults, Keyboard cheatsheet, About 推敲, mobile sheet) + `suikou-light.html`.
  Route: `http://localhost:4710/` then `⌘,`. `assets/src/settings/SettingsModal.tsx`.

- [ ] **3. Review — file_selection** — every state in `design/pages/review/states-codex.html`
  Part 1 (Empty, Source, Composer, Side rail, Preview, HTML, All files, Submit, Compare,
  System, and the E-series comment/verdict states) + `states-light.html` + `states-mobile.html`.
  Route: `http://localhost:4710/reviews/019f2000-4439-7af9-a123-bfab4e3af3ca`.
  Components: `ArtifactReviewShell.tsx`, `Navigator.tsx`, `StatusBar.tsx`, `TopBar*.tsx`,
  `CommentRail.tsx`, `CommentCard*.tsx`, `Composer*.tsx`, the views.

- [ ] **4. Review — git_diff** — every J-group state (J1-J8) in `states-codex.html` Part 2
  + mobile (`states-mobile.html`).
  Route: `http://localhost:4710/reviews/019f22a4-a8e7-7c92-8fb9-f74ba7f76044` (a source file, not `bun.lock`).
  Components: `views/DiffView.tsx`, `diff-refs.ts`, `ReviewFileTree.tsx`, `TopBarShell.tsx`.

## Done when

All boxes `[x]`: the app defaults to the Suikou Dark palette and every mockup
state (desktop + mobile, light + dark) is reproduced so the app is
indistinguishable from the mockup, `typecheck` + `test` + `build` green.
