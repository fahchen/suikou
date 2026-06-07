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
| Scope | The granularity a comment attaches to: `line` (a line range, with the quoted source captured), `file` (a whole file), or `review` (the whole review). |
| Critique type | The action a comment expects from the agent: `fix_required` (must change), `needs_answer` (must respond), or `note` (informational). Per-comment; distinct from a review's verdict. |
| Quote | The source text of the lines a line-scoped comment anchors to, captured at comment creation to support cross-round re-anchoring. |
| Pending / Published | A comment's lifecycle state. `pending` comments are mutable and invisible to the agent; submitting a review freezes its pending comments' content as `published` and exposes them to the agent. |
| Resolved | A published comment the human reviewer has marked addressed, recording the round it was resolved at (`resolved_round`). |
| Thread | A comment together with its replies. The human reviewer authors comments and replies; the agent may only reply, via a dedicated reply API. |
| Carry-forward | Bringing the prior round's unresolved published comments onto a new round when the artifact advances, so open feedback is not lost. |
| Re-anchor | Relocating a carried line-scoped comment in the new snapshot by exact match of its captured quote. |
| Outdated | A carried comment whose quote no longer exists in the new snapshot: retained but without a valid line anchor, awaiting the reviewer to relocate it. |
| Lineage | The origin link connecting a comment's per-round rows across the rounds it survives; each round keeps its own immutable row. |
| Round diff | The rendered difference between two rounds: the snapshot text diff plus the critique state changes (resolved, added, carried-forward) and any verdict change. |
| Approval | The artifact's accepted state, expressed as a review submitted with verdict `approve` on the latest round; records the approved round. Reversible — dismissed by the reviewer or superseded by an agent resubmission. Among verdicts, `approve` is the only one that can end the review loop (see BDR-0013). |
| Approved round | The round at which an `approve` verdict was granted. |
| Export | A read-only, self-contained, structured (JSON) rendering of an artifact's latest round for agent consumption: the round's published critique (with replies and per-comment critique types), its snapshot content, and the latest verdict. Reading it never mutates state. |
