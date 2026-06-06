# Suikou — Technical Architecture

> Companion to [`prd.md`](./prd.md). The PRD defines *what* Suikou is; this
> document defines *how* it is built.

## 1. Guiding Constraint: Server-Authoritative State

Suikou's entire frontend architecture follows from one decision: **the server
owns all review state**, and the React client is a rendering surface that
applies incremental updates.

This is realized through **Musubi**, a LiveView-style server-authoritative
runtime where the client is a TypeScript/React application instead of
server-rendered HTML.

- Each Musubi *store* lives server-side as its own process, renders typed state,
  and streams **RFC 6902 JSON Patch** envelopes over a Phoenix socket.
- The client applies these patches to a local snapshot. It does **not** fetch,
  cache, or reconcile server data itself.

Three rules fall directly out of this:

| Rule | Reason |
|---|---|
| **No TanStack Query** | The server is the single source of truth. There is no client-side fetch/cache layer to manage. |
| **TanStack Router = routing only** | Use it for URL/route matching. Do **not** use its loaders, `pendingComponent` data APIs, or any data-fetching integration. |
| **MobX = ephemeral client state only** | Drafts, selections, hover anchors, modal open/close, optimistic UI. **Never mirror server state into MobX** — server state belongs to Musubi snapshots. |

The MobX ↔ Musubi boundary is the single most important invariant in the
codebase. Violating it (e.g. copying a server-owned comment list into a MobX
store) reintroduces the cache-coherence problems this architecture exists to
avoid.

## 2. Layers

| Layer | Technology | Notes |
|---|---|---|
| Persistence | Ecto + `ecto_sqlite3` | Single-file local DB. Local-first; no remote infra required. |
| Typed schemas / structs | EctoTypedSchema + TypedStructor | Auto-generated `@type t()` for Ecto schemas and plain structs — feeds Dialyzer. |
| Server state / transport | Musubi store + `Musubi.Socket` | Requires Phoenix as the socket transport host. |
| Web framework | Phoenix | API-only + socket host. **No** LiveView, no server-rendered HTML. |
| Module boundaries | Reach (`reach.check --arch`) | Architecture/boundary policy in `.reach.exs`. See [§4](#module-boundaries-reach). |
| UI library | React 19 (`react` / `react-dom` `~19.2`) | Latest. |
| Routing | TanStack Router v1 (`@tanstack/react-router` `~1.170`) | Routing only — loaders/query integration disabled. |
| Ephemeral client state | MobX 6 (`mobx` `~6.16` + `mobx-react-lite` `~4.1`) | UI-local state only. |
| Components | Base UI shadcn registry | shadcn variant built on Base UI primitives (not Radix). Do not mix Radix and Base UI. |
| AI/artifact UI | `elements.ai-sdk.dev` | Prebuilt elements for agent/artifact surfaces. |
| Styling | Tailwind CSS v4 | |
| Frontend runtime / package manager | Bun | Installs deps, runs scripts, drives Vite. |
| Frontend tooling | viteplus | Format + lint for the frontend. |
| Backend quality | VibeKit (`mix ci`) | Strict quality suite — see [§8](#8-backend-quality-vibekit). |

Backend type safety is mechanical, not hand-maintained:

- **Ecto schemas** use [`EctoTypedSchema`](https://ecto-typed-schema.hexdocs.pm/)
  — `use EctoTypedSchema` + `typed_schema` in place of `use Ecto.Schema` +
  `schema`. It infers `@type t()` (including associations, nullable, embeds)
  from field definitions, so specs never drift.
- **Plain structs** (command params, DTOs, value objects) use
  [`TypedStructor`](https://hex.pm/packages/typed_structor), the type-generation
  engine `EctoTypedSchema` is built on.

Generated specs feed Dialyzer (`mix ci`), so type drift surfaces as a CI failure
rather than rot.

## 3. Data Flow

```
                  ┌──────────────────────── Server (Elixir) ─────────────────────────┐
                  │                                                                   │
  SQLite ◄──Ecto──┤  Domain / Contexts  ◄──►  Musubi Store (process, typed state)     │
                  │                                      │                            │
                  │                              renders │ RFC 6902 JSON Patch         │
                  └──────────────────────────────────────┼────────────────────────────┘
                                                          │  Phoenix Socket
                  ┌───────────────────────────────────────▼─── Client (React/TS) ─────┐
                  │  @musubi/client + @musubi/react                                    │
                  │     useMusubiSnapshot / useMusubiRoot / useMusubiCommand           │
                  │                                                                    │
                  │  TanStack Router (routing)      MobX (ephemeral UI state)          │
                  │  Base UI shadcn components       Tailwind v4                        │
                  └────────────────────────────────────────────────────────────────────┘
```

- **Reads**: components subscribe to Musubi snapshots via `useMusubiSnapshot` /
  `useMusubiRoot`. State changes arrive as JSON Patches.
- **Writes**: components dispatch commands via `useMusubiCommand`
  (`{ dispatch, isPending, error, data, reset }`). The server mutates state and
  emits the resulting patch.
- **Local interactions** (typing a draft comment, selecting a region) live in
  MobX until committed, then are dispatched as a Musubi command.

## 4. Project Layout

Single Phoenix mix project. Frontend lives under `assets/`, built by Vite.

```
suikou/
├── lib/
│   ├── suikou/                  # domain contexts (boundaries via Reach)
│   │   └── <context>/           # e.g. lib/suikou/artifacts/
│   │       ├── <context>.ex     #   Boundary root + public API (defdelegate)
│   │       ├── schemas/         #   Ecto schemas (EctoTypedSchema)
│   │       ├── queries/         #   query modules
│   │       ├── events/          #   domain events
│   │       └── workers/         #   background jobs (if any)
│   └── suikou_web/              # Phoenix endpoint, Musubi.Socket, stores
├── priv/
│   └── repo/migrations/
├── assets/
│   ├── src/
│   │   ├── generated/
│   │   │   └── musubi.d.ts      # produced by the :musubi_ts mix compiler
│   │   ├── routes/              # TanStack Router
│   │   ├── stores/              # MobX (ephemeral only)
│   │   └── components/          # Base UI shadcn registry
│   ├── vite.config.ts
│   ├── package.json
│   └── bun.lock
├── docs/
├── mise.toml                   # toolchain versions (Elixir, Erlang, Bun)
└── mix.exs
```

Context directory layout follows the convention used in the sibling `muku`
project (`/Users/fahchen/PersonalProjects/muku`): each context is a single
directory `lib/suikou/<context>/` whose top-level module `<context>.ex` is the
**public API** — it re-exports operations via `defdelegate` to internal modules.
Internal work lives in subdirectories (`schemas/`, `queries/`, `events/`,
`workers/`, `handlers/`, …) that callers outside the context may not reach
directly. This public/internal boundary is enforced by Reach (see below), not by
a compiler.

The Musubi `:musubi_ts` compiler generates `assets/src/generated/musubi.d.ts`.
The generated `Musubi.Stores` type drives inference for `connect<R>()` and every
`mountStore` call, so frontend types stay in lockstep with server store
definitions.

### Module Boundaries (Reach)

Architecture boundaries are enforced by **Reach** alone (`reach.check --arch`,
via VibeKit) — there is **no Boundary library** in the stack. Reach was chosen
as the single source of architecture truth: its `.reach.exs` policy expresses
the public/internal boundary model *and* a superset Boundary cannot
(side-effect, banned-call, and source policies, plus `--smells`). The tradeoff
is that enforcement happens at the `mix ci` check step rather than at compile
time, so `mix ci` runs `reach.check` with `--strict` to make it a hard gate.

Policy lives in `.reach.exs`:

```elixir
# .reach.exs
[
  layers: [
    web: "SuikouWeb.*",
    domain: "Suikou.*"
  ],
  deps: [
    # domain may never depend on web (stores consume contexts, not the reverse)
    forbidden: [{:domain, :web}]
  ],
  boundaries: [
    # only <context>.ex is public; its subdirectories are internal
    public: ["Suikou.*"],
    internal: ["Suikou.*.Schemas.*", "Suikou.*.Queries.*"]
  ]
]
```

Each context's `<context>.ex` is the public entry; internal modules
(`schemas/`, `queries/`, …) are reachable only from within the context. Musubi
store modules live in the `web` layer and consume domain contexts — never the
reverse.

## 5. Build & Serving

The toolchain is pinned by **mise** (`mise.toml`): Elixir, Erlang, and Bun. A
single `mise install` provisions every runtime version, so backend and frontend
share one version source of truth.

Bun is the frontend runtime and package manager. Vite handles bundling/HMR;
Bun installs deps and runs the Vite scripts (`bun install`, `bun run dev`,
`bun run build`).

### Production

- `bun run build` produces the Vite bundle in `assets/dist/`.
- `mix release` produces the deployable artifact.
- Phoenix serves `assets/dist/` via `Plug.Static`, with an SPA fallback to
  `index.html` for client routes.
- The Musubi socket is served same-origin — no separate frontend host.

### Development

- `bun run dev` starts the Vite dev server (frontend, HMR).
- Phoenix runs the backend separately.
- Vite proxies the Musubi socket connection through to Phoenix.

## 6. Out of Scope (this stage)

- **CLI** (`suikou open/diff/review/export`) — deferred. The Local Web UI
  (Musubi + React) is the primary path first. Packaging approach (escript /
  Burrito / thin shell) undecided.
- Semantic/AST anchors, live-app review, review replay — see PRD *Future
  Directions*.

## 7. Open Risks

- **Musubi is pre-1.0** (v0.7.2): breaking changes expected before 1.0. Pin the
  version and verify APIs against `hexdocs.pm/musubi` before use.
- **Base UI shadcn registry maturity**: confirm component coverage matches the
  review-surface needs before committing broadly.
- **VibeKit is pre-1.0** (`~> 0.1`): an Igniter installer; pin and re-run on
  upgrades. ExSlop is also early-stage. (ExDNA `~> 1.5` and Reach `~> 2.6` are
  post-1.0 but young and fast-moving.)
- **Reach is the sole boundary enforcer**: with no compiler-level Boundary,
  architecture violations are caught only at `mix ci` time, not while editing.
  `reach.check` runs `--strict` so violations hard-fail CI.

## 8. Backend Quality (VibeKit)

The Elixir backend's quality setup is bootstrapped by
[**VibeKit**](https://github.com/elixir-vibe/vibe_kit), an Igniter installer
from the Elixir Vibe ecosystem. It wires a strict, AI-coding-aware quality
suite into the project with one command:

```sh
# new project
mix igniter.new suikou --install vibe_kit --claude-md
# or into an existing project
mix igniter.install vibe_kit
```

### `mix ci` pipeline

VibeKit installs a single `mix ci` alias that runs the full gate:

```elixir
ci: [
  "compile --warnings-as-errors",
  "format --check-formatted",
  "test",
  "credo --strict",
  "dialyzer",
  "ex_dna --max-clones 0",                # zero duplicate-code clones allowed
  "reach.check --arch --smells --strict"  # boundary policy + smells, hard-gated
]
```

It also adds `def cli, do: [preferred_envs: [ci: :test]]`, `.credo.exs` (with
ExSlop plugin checks), and a starter `.reach.exs` (initially `[]`).

### Included checks

| Tool | Role | Notable default |
| --- | --- | --- |
| [Credo](https://hex.pm/packages/credo) | Static analysis + style | `--strict` |
| [Dialyxir](https://hex.pm/packages/dialyxir) | Dialyzer success typing | — |
| [ExDNA](https://hex.pm/packages/ex_dna) | AST-aware duplicate detection | `--max-clones 0` (zero-clone) |
| [ExSlop](https://hex.pm/packages/ex_slop) | Credo plugin: low-quality generated-code patterns | recommended checks on |
| [Reach](https://hex.pm/packages/reach) | Architecture/boundary policy + cross-function smells; **sole boundary enforcer** | `--arch --smells --strict` |

`.reach.exs` starts empty; add layer / boundary / source / call policies as the
architecture settles (see [§4](#module-boundaries-reach)) — enforce the
`Suikou` (domain) ↔ `SuikouWeb` boundary and keep Musubi store modules out of
the domain layer.

This **supersedes** the earlier "credo + dialyzer + mix format" note — those are
now subsumed into the VibeKit `mix ci` gate.
