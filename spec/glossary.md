# Glossary

Shared domain terminology (ubiquitous language) for Suikou.

| Term | Definition |
|------|------------|
| Artifact | A generated unit submitted for human review. MVP scope: a markdown document (e.g. a plan or doc). |
| Submission | The act of an agent placing artifact content into Suikou via the API: a first submit creates the review at round 1, a resubmit under the same artifact id advances the round when content changed. Only ever an agent action; never used for human critique. |
| Review round | A versioned state of an artifact under review: one full content snapshot plus the round number. Rounds advance automatically when submitted content changes. |
| Snapshot | The full stored content of an artifact for a given round. |
| Agent | An external system that generates artifacts, submits them, and reads structured critique. Not part of the Suikou runtime; never owns critique or approval state. |
| Human reviewer | The person who reviews artifacts, leaves critique, and approves outputs. Holds final judgment. |
| Server-authoritative | The local Suikou runtime owns review state; clients (agent CLI, browser) do not push authoritative state. |
| Review | A batch of the reviewer's pending comments on a round, submitted together with one verdict. Submitting a review publishes its comments and records its verdict. A round may receive more than one review. |
| Verdict | A review's overall disposition: `approve` (the artifact is accepted), `request_changes` (the reviewer wants revisions), or `comment` (neutral feedback, no acceptance). Orthogonal to a comment's critique type — verdict is the per-review disposition, critique type is the per-comment expected action. |
| Comment | A unit of structured human critique on a round, carrying a scope, a critique type, a body, and the round it attaches to. Authored as `pending`; becomes `published` when the review batching it is submitted. |
| Scope | The granularity a comment attaches to: `line` (carries an anchor locating a span), `file` (a whole file), or `review` (the whole review). |
| Anchor | The polymorphic selector locating a line-scoped comment in a snapshot. For text/markdown/code it is a `line_range` (start line, end line, captured quote); a future `element` selector locates a comment on rendered HTML. `file` and `review` comments carry no anchor (see BDR-0017). |
| Line range | The anchor kind for text/markdown/code: a start line, an end line, and the quoted source of those lines, used to re-anchor across rounds. |
| Critique type | The action a comment expects from the agent: `fix_required` (must change), `needs_answer` (must respond), or `note` (informational). Per-comment; distinct from a review's verdict. |
| Quote | The source text of the lines a line-range anchor covers, captured at comment creation; retained for display and for rendering an outdated comment against the text it was about. |
| Pending / Published | A comment's lifecycle state. `pending` comments are mutable and invisible to the agent; submitting a review freezes its pending comments' content as `published` and exposes them to the agent. |
| Resolved | A published comment the human reviewer has marked addressed, recording the round it was resolved at (`resolved_round`). |
| Thread | A comment together with its replies. The human reviewer authors comments and replies; the agent may only reply, via a dedicated reply API. |
| Carry-forward | Bringing the prior round's unresolved published comments onto a new round when the artifact advances, so open feedback is not lost. |
| Re-anchor | Relocating a carried line-range comment in the new snapshot by mapping its line range through the round-to-round line diff: an unchanged line moves to its new position, an edited or deleted line marks the comment outdated (see BDR-0017). |
| Outdated | A carried comment whose anchored lines were edited or deleted in the new snapshot: retained but without a valid anchor, awaiting the reviewer to relocate it. |
| Original anchor | A frozen copy of a comment's anchor and the round it was authored at, set once at creation and copied unchanged onto every carried row, so an outdated comment can report where it began without walking its lineage. |
| Lineage | The origin link connecting a comment's per-round rows across the rounds it survives; each round keeps its own immutable row. |
| Round diff | The rendered difference between two rounds: the snapshot text diff plus the critique state changes (resolved, added, carried-forward) and any verdict change. |
| Approval | The artifact's accepted state, expressed as a review submitted with verdict `approve` on the latest round; records the approved round. Reversible — dismissed by the reviewer or superseded by an agent resubmission. Among verdicts, `approve` is the only one that can end the review loop (see BDR-0013). |
| Approved round | The round at which an `approve` verdict was granted. |
| Export | A read-only, self-contained, structured (JSON) rendering of an artifact's latest round for agent consumption: the round's published critique (with replies and per-comment critique types), its snapshot content, and the latest verdict. Reading it never mutates state. |
