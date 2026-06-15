---
id: BDR-0021
title: Element anchor for HTML artifact review with client-owned re-anchoring
status: accepted
date: 2026-06-13
summary: HTML artifacts are reviewed as rendered documents inside a sandboxed iframe; located comments use an element anchor of selector plus quote, and carry-forward keeps that anchor verbatim for client-side resolution against the live iframe DOM
---

## Scope

**Feature**: domains/critique/features/authoring.feature, domains/critique/features/carry-forward.feature
**Rule**: An HTML artifact is reviewed against its rendered DOM, and element anchors are resolved by the client

## Context

[[BDR-0017-polymorphic-selector-anchor]] deliberately made a comment location a
typed selector so text/code could use `line_range` now and rendered HTML could
introduce an `element` selector later without widening the schema again. Plan B
is that first HTML caller.

An `.html` or `.htm` artifact is not primarily reviewed as source text; the
reviewer wants to point at the rendered page. That raises two linked questions:
what selector shape identifies a rendered region, and which side of the system
owns re-anchoring when the selector must be resolved against browser DOM rather
than server-side text.

The shared model changes in [[BDR-0022-comment-location-model-refactor]] mean the
anchor kind now lives entirely inside `anchor.__type__`, so the HTML decision is
only about the `element` variant's payload and runtime ownership.

## Behaviours Considered

### Selector shape
- **A. CSS selector plus text quote (chosen)**: store a selector that can find
  the element again and a quote that shows what the reviewer selected.
- **B. Selector only**: store only the structural locator.
- **C. Server-side DOM range / XPath machinery**: use a richer selector model
  with heavier DOM semantics.

### Re-anchoring ownership
- **A. Client-only resolution (chosen)**: carry forward the stored selector and
  quote unchanged; the browser resolves them against the iframe DOM and renders
  outdated on a miss.
- **B. Server-side relocate**: parse HTML on the server and try to relocate the
  selector there before shipping comment state to the client.

### Rendering sandbox
- **A. Sandboxed iframe with same-origin DOM access but no scripts (chosen)**:
  render `srcdoc` inside an iframe with `allow-same-origin` and no
  `allow-scripts`, injecting a `<base>` element for asset resolution.
- **B. Unsandboxed iframe or scripts allowed**: let arbitrary artifact scripts
  execute.

## Decision

### 1. HTML located comments use an `element` anchor

This BDR is the first concrete caller of [[BDR-0017-polymorphic-selector-anchor]]'s
future `element` selector. The anchor payload is:

- `selector`: a CSS selector for the rendered element
- `quote`: the captured text quote for display and reviewer context

The selector identifies where the comment belongs in the rendered DOM; the quote
preserves what the reviewer actually pointed at.

### 2. HTML renders in a sandboxed iframe

`.html` and `.htm` artifacts render in an iframe sandboxed with
`allow-same-origin` and without `allow-scripts`. The server injects a `<base>`
element that points at the artifact asset route so relative asset URLs resolve
the same way they would from the underlying file tree.

The sandbox split is intentional. The parent must be able to inspect and
annotate the iframe DOM in order to resolve selectors and draw comment affordances,
which requires same-origin access. But artifact scripts must not execute, because
the reviewed HTML is content under review, not trusted application code. Removing
`allow-scripts` keeps the page inert while still leaving its DOM available for
selection and highlighting.

### 3. Element re-anchoring is client-owned

Carry-forward copies the `element` anchor's `selector` and `quote` verbatim onto
the next round. The server does not attempt to relocate it, does not compute
outdated for it, and does not parse the HTML with Floki or any other DOM library.
`resolve/2` therefore returns the `element` anchor unchanged.

The browser owns resolution because the browser already has the rendered DOM the
reviewer sees. Recreating that logic on the server would mean duplicating DOM
interpretation against raw HTML, then trying to keep it behaviorally aligned with
the actual iframe document. That is the wrong ownership boundary for v1. If the
selector no longer matches in the rendered iframe, the client marks the comment
outdated there and surfaces the miss directly in the same environment where the
selection exists.

### 4. Outdated is a client-visible render state for element anchors

For `element` anchors, "outdated" means the selector no longer resolves in the
current iframe DOM. That state is computed client-side during render rather than
persisted by server-side relocation. This keeps HTML review additive over
[[BDR-0017-polymorphic-selector-anchor]]: text/code anchors still use server
re-anchoring, while element anchors use the same stored selector model with a
different resolver owner.

## Rejected Alternatives

- **Selector only (B)**: loses the quoted reviewer context that the existing
  critique model already preserves for located comments.
- **Heavier DOM selector machinery (C)**: adds complexity before a caller proves
  CSS selector plus quote is insufficient.
- **Server-side relocate (B)**: duplicates browser DOM behavior on the server,
  adds HTML parsing machinery, and still cannot be more authoritative than the
  iframe the reviewer actually sees.
- **Scripts enabled / unsandboxed rendering (B)**: turns reviewed content into
  executable content, which is the wrong trust model for artifact review.

