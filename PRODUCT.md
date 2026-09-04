# Product

## Register

product

## Users

Developers running a local, server-authoritative code review over work produced
by AI coding agents. They are the reviewer and the operator at once: they stage
a review (a set of files, or a diff between two refs), read closely, leave
anchored comments, submit a round, and iterate as the
agent responds. They live in this surface for long stretches and switch between
reading code, reading prose (markdown), and inspecting rendered HTML. They are
fluent: they expect keyboard reach, dense information, and no hand-holding.
Sessions are focused and often long; the tool is a workbench, not a destination.

## Product Purpose

Suikou turns "review the agent's output" into a real workbench. It reorganizes a
GitHub-style "files changed" view into a three-surface workspace (a file
navigator, a reading/commenting editor, and round/submit controls
reached from the toolbar) so a single reviewer can drive many rounds of
human-in-the-loop iteration with an agent. Two review kinds are first class:
file_selection (review files at their current state) and git_diff (review a diff
between refs). Comments anchor to lines, diff hunks, or HTML elements; a
round's critique is batch-submitted together; the agent replies and re-snapshots
feed the next round. Success is a reviewer who can hold the whole review in their
head and move through it quickly, with the tool never getting in the way of the
code and the comments.

## Brand Personality

The name is 推敲 (Suikou): the act of deliberating over the exact word to use,
from the Tang story of a poet weighing "push" against "knock" for a single line.
That is the product in one phrase, careful refinement of what is written, and it
anchors the brand: review is not a gate to pass, it is the deliberate weighing of
a change until it is right.

Precise, restrained, expert. The voice is a senior engineer's: exact, calm, and
economical. Trust is earned through information density and quiet correctness,
not through persuasion, decoration, or celebration. Three words: precise,
restrained, expert. The interface should feel like a well-tuned instrument that
respects the user's competence, never a product trying to delight or onboard
them.

## Anti-references

- Enterprise bloat (Jira, Jenkins, Gerrit): heavy chrome, nested panels, a
  cockpit of bulbs and gears competing with the work.
- Consumer flash: rounded illustrations, screens full of colorful emoji,
  celebration animations, bouncy easing.
- Generic AI SaaS template: cream backgrounds, gradient hero sections, purple
  glow, the big-number "hero metric" layout.

## Design Principles

1. Code and comments are the product; chrome recedes. The work under review must
   dominate the screen. Toolbars, meters, and status are support, sized and
   colored to stay out of the way.
2. One fact, one home. A given piece of state (open-comment count, connection,
   current file) has a single canonical place. No surface echoes a number a
   neighbor already shows.
3. States are first class. Every meaningful state (empty, draft, outdated,
   stranded, refs-moved, branch-deleted) is a complete, legible page,
   not an afterthought or a toast.
4. Expert density over hand-holding. Favor compact layouts, keyboard reach, and
   trust in the user. No onboarding scaffolding, no explanatory noise on a
   surface the user already understands.
5. Faithful to the domain. The UI mirrors the real review model (kinds, rounds,
   anchors, agent replies) exactly. No fake affordances, no controls
   that imply behavior the runtime does not have.

## Accessibility & Inclusion

Target WCAG AA. Body and UI text hold at least 4.5:1 against their surface;
muted text is tuned to stay AA-safe on panel backgrounds, not allowed to fade
below it for style. Status is never carried by color alone (change status uses
A/M/D glyphs, comment type uses labeled pills, diffs use +/- signs alongside
green/red). A single visible, accent-tinted focus ring on every interactive
surface. Honor prefers-reduced-motion. Keep contrast and meaning intact for
color-vision differences by pairing every color cue with a shape or label.
