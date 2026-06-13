# Glossary

Shared domain terminology (ubiquitous language) for Suikou.

| Term | Definition |
|------|------------|
| Project | A directory on disk registered for review. The server scans it and lists its files as candidate artifacts. The top-level board the human creates first; an artifact is created under it (see BDR-0018). |
| Artifact | A unit under human review, created by the reviewer selecting a source under a project. MVP scope: a single markdown file read from the project directory (future sources, e.g. a GitHub pull request, are deferred — see BDR-0018). |
| Submission | The act of creating or refreshing an artifact's draft round by reading the selected file from disk. A human action: selecting a file creates round 0; re-snapshotting refreshes the current draft round's content. Never an agent action; the agent never submits content (see BDR-0018). |
| Review round | A versioned state of an artifact under review: one full content snapshot plus the round number, numbered from 0. Rounds advance when the human submits — submitting publishes the round's review and creates the next round (see BDR-0018). |
| Snapshot | The full stored content of an artifact for a given round. |
| Agent | An external system that edits the reviewed files on disk and reads structured critique. It only replies to published comments via the dedicated reply API; it never submits content and never advances a round (see BDR-0018). Not part of the Suikou runtime; never owns critique or approval state. |
| Human reviewer | The person who reviews artifacts, leaves critique, and approves outputs. Holds final judgment. |
| Server-authoritative | The local Suikou runtime owns review state; clients (agent CLI, browser) do not push authoritative state. |
| Review | A batch submitted together with one verdict on a round. Submitting a review publishes every pending comment across the whole review — all files, not just the submitted one — while recording the verdict and advancing only the submitted round (see BDR-0018, BDR-0019). Each round receives exactly one review — the one that advances it. |
| Verdict | A review's overall disposition: `approve` (the artifact is accepted), `request_changes` (the reviewer wants revisions), or `comment` (neutral feedback, no acceptance). Orthogonal to a comment's critique type — verdict is the per-review disposition, critique type is the per-comment expected action. |
| Comment | A unit of structured human critique on a round, carrying a scope, a critique type, a body, and the round it attaches to. Authored as `pending`; becomes `published` when the review batching it is submitted. |
| Scope | The granularity a comment attaches to: `line` (carries an anchor locating a span), `file` (a whole file), or `review` (the whole review). |
| Anchor | The polymorphic selector locating a line-scoped comment in a snapshot. For text/markdown/code it is a `line_range` (start line, end line, captured quote); a future `element` selector locates a comment on rendered HTML. `file` and `review` comments carry no anchor (see BDR-0017). |
| Line range | The anchor kind for text/markdown/code: a start line, an end line, and the quoted source of those lines, used to re-anchor across rounds. |
| Critique type | The action a comment expects from the agent: `fix_required` (must change), `needs_answer` (must respond), or `note` (informational). Per-comment; distinct from a review's verdict. |
| Quote | The source text of the lines a line-range anchor covers, captured at comment creation; retained for display and for rendering an outdated comment against the text it was about. |
| Pending / Published | A comment's lifecycle state. `pending` comments are mutable and invisible to the agent; submitting a review freezes the whole review's pending comments — every file's, not just the submitted one's — as `published` and exposes them to the agent (see BDR-0019). |
| Resolved | A published comment the human reviewer has marked addressed, recording the round it was resolved at (`resolved_round`). |
| Thread | A comment together with its replies. The human reviewer authors comments and replies; the agent may only reply, via a dedicated reply API. |
| Carry-forward | Bringing the prior round's unresolved published comments onto a new round when the artifact advances, so open feedback is not lost. |
| Re-anchor | Relocating a carried line-range comment in the new snapshot by mapping its line range through the round-to-round line diff: an unchanged line moves to its new position, an edited or deleted line marks the comment outdated (see BDR-0017). |
| Outdated | A carried comment whose anchored lines were edited or deleted in the new snapshot: retained but without a valid anchor, awaiting the reviewer to relocate it. |
| Original anchor | A frozen copy of a comment's anchor and the round it was authored at, set once at creation and copied unchanged onto every carried row, so an outdated comment can report where it began without walking its lineage. |
| Lineage | The origin link connecting a comment's per-round rows across the rounds it survives; each round keeps its own immutable row. |
| Round diff | The rendered difference between two rounds: the snapshot text diff plus the critique state changes (resolved, added, carried-forward) and any verdict change. |
| Approval | The artifact's accepted state, expressed as a review submitted with verdict `approve` on the latest round; records the approved round. Reversible — dismissed by the reviewer or superseded when a later round is created. Among verdicts, `approve` is the only one that can end the review loop (see BDR-0013). |
| Approved round | The round at which an `approve` verdict was granted. |
| Export | A read-only, self-contained, structured (JSON) rendering of an artifact's latest round for agent consumption: the round's published critique (with replies and per-comment critique types), its snapshot content, and the latest verdict. Reading it never mutates state. |
