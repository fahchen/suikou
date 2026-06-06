# Suikou — Product Requirements Document

## Overview

Suikou is a local-first review surface for human-agent collaboration.

Agents generate artifacts for human judgment. Humans review these artifacts through structured critique, inline annotations, threaded discussion, and iterative refinement rounds until the result is approved.

Suikou is intentionally not:

- an agent runtime
- a memory system
- an orchestration framework
- a coding agent
- a replacement for GitHub

Instead, Suikou focuses on one responsibility:

> making generated artifacts reviewable.

---

# Name Origin

The name “Suikou” (推敲 / すいこう) comes from a classical Chinese literary anecdote.

The poet Jia Dao originally wrote:

> 僧推月下门  
> (A monk pushes a gate beneath the moon.)

Later, after reflection and discussion, the word 推 (“push”) was replaced with 敲 (“knock”):

> 僧敲月下门  
> (A monk knocks on a gate beneath the moon.)

This process of repeatedly refining expression through critique and judgment became known as “推敲”.

Suikou represents the same philosophy for the age of generative systems:

generation is not the final step;
judgment, refinement, and iteration are where quality emerges.

---

# Problem Statement

Modern generative systems can rapidly produce:

- code
- implementation plans
- markdown documents
- UI prototypes
- HTML previews
- diagrams
- architecture proposals
- reasoning artifacts

However, current tooling lacks a dedicated system for structured human review of generated artifacts.

Existing solutions are insufficient:

## GitHub Pull Requests

- optimized for human-to-human code review
- tightly coupled to repositories and commits
- poor support for local-only or pre-commit review
- weak support for HTML, live apps, SVG, and non-code artifacts

## Chat Interfaces

- comments are unstructured
- revisions lose context
- difficult to compare rounds
- no stable review anchors
- poor artifact-centric workflows

## Document Review Systems

- not designed for agent collaboration
- no machine-consumable critique semantics
- limited iterative revision workflows

As AI systems increasingly generate artifacts autonomously, human judgment becomes the bottleneck.

Suikou exists to make human review scalable, structured, and artifact-native.

---

# Vision

Suikou is the review and alignment layer between humans and generative systems.

It enables:

- structured critique
- asynchronous human-agent discussion
- iterative refinement
- artifact review across multiple modalities
- approval-based completion workflows

The system acts as a dedicated surface for human judgment.

---

# Core Principles

## 1. Local-First

Artifacts and reviews should work locally without requiring remote infrastructure.

Users should be able to review:

- local files
- generated previews
- temporary artifacts
- experimental plans
- uncommitted changes

without pushing anything to GitHub or external services.

---

## 2. Artifact-Native

Suikou reviews artifacts, not repositories.

Artifacts may include:

- markdown
- code diffs
- HTML
- SVG
- screenshots
- running web applications
- architecture diagrams
- generated documents

The rendering surface should adapt to the artifact type.

---

## 3. Human Judgment is the Product

Suikou does not attempt to replace human judgment.

Its purpose is to:

- collect
- structure
- preserve
- communicate

human critique to generative systems.

---

## 4. Structured Critique

Comments are not plain text only.

Critique should carry semantic meaning.

Example categories:

- blocking
- question
- clarification
- suggestion
- nit
- risk
- missing-context
- inconsistency

This allows agents to better interpret reviewer intent.

---

## 5. Iterative Refinement

Review is not a one-time event.

The core workflow is:

artifact generation
→ human critique
→ agent response or revision
→ additional critique
→ approval
→ finalized artifact

Rounds are first-class concepts.

---

## 6. Agent-Agnostic

Suikou does not implement agent capabilities.

Agents are external systems.

Suikou only provides:

- artifact presentation
- review storage
- critique workflow
- revision tracking
- communication surfaces

Any agent capable of reading structured review output may integrate with Suikou.

---

# User Roles

## Human Reviewer

Responsible for:

- reviewing artifacts
- leaving critique
- resolving discussions
- approving outputs
- guiding refinement

---

## Agent

Responsible for:

- generating artifacts
- requesting review
- responding to critique
- revising outputs
- resubmitting updated rounds

Agents are treated as participants in the workflow, not embedded system components.

---

# Core Workflow

## Step 1 — Agent Generates Artifact

Examples:

- implementation plan
- code diff
- rendered HTML preview
- generated SVG
- architecture proposal

The agent chooses the most appropriate representation.

---

## Step 2 — Human Reviews Artifact

The reviewer may:

- comment inline
- highlight regions
- ask questions
- request changes
- leave suggestions
- approve sections

Review occurs directly on the rendered artifact.

---

## Step 3 — Agent Responds

The agent may:

- revise the artifact
- answer questions
- reject critique with reasoning
- clarify intent

Discussion remains attached to the relevant review region.

---

## Step 4 — New Round Created

Updated artifacts form a new review round.

The system maintains:

- round history
- discussion continuity
- review status
- artifact lineage

---

## Step 5 — Approval

Once the reviewer is satisfied, the artifact reaches terminal approval state.

Approval indicates:

> the artifact sufficiently matches human intent.

---

# Semantic Anchors

A major challenge in generative workflows is maintaining comment positioning across revisions.

Initial implementation may support:

- line-based anchors
- DOM-region anchors

Long-term direction:

- semantic anchors
- AST-aware mapping
- structural similarity tracking
- rendered region identity preservation

---

# Discussion Model

Comments support threaded replies.

Both humans and agents may participate.

Example:

Reviewer:
> This abstraction feels too indirect.

Agent:
> Would you prefer:
> - fewer layers
> - flatter control flow
> - reduced indirection
> - simplified naming

This creates structured deliberation rather than one-way review.

---

# Approval Model

Approval is a terminal state.

Agents do not control approval.

Agents may indicate:

> all blocking remarks addressed.

Final judgment remains with the human reviewer.

---

# Non-Goals

Suikou is not:

- an autonomous coding agent
- a project management system
- a task orchestration framework
- a memory engine
- a replacement for GitHub
- a deployment platform
- a persistent knowledge graph

The product intentionally maintains a narrow boundary around review and refinement workflows.

---

# Initial MVP

## CLI

```bash
suikou open artifact.md
suikou diff
suikou review
suikou export --json
```

---

## Local Web UI

Features:

- artifact rendering
- inline comments
- threaded discussions
- review rounds
- diff comparison
- approval state
- semantic critique types

---

## Structured Review Export

Example:

```json
[
  {
    "type": "blocking",
    "target": "paragraph",
    "comment": "This section ignores idempotency constraints."
  }
]
```

Designed for machine consumption by external agents.

---

# Future Directions

Potential future capabilities:

- live app review
- visual region annotations
- SVG-aware commenting
- browser-based review sessions
- semantic anchor engines
- review replay
- artifact lineage visualization
- multi-agent review participation

---

# Positioning

Suikou is not a better chatbot.

It is not a coding agent.

It is a dedicated review surface for the age of generative artifacts.

AI systems generate.

Humans judge.

Suikou is where refinement happens.
