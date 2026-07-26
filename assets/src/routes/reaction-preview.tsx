import { Navigate, createFileRoute } from "@tanstack/react-router"

import { AuthorBadge } from "../review/components/comments/AuthorBadge"

export const Route = createFileRoute("/reaction-preview")({
  component: ReactionPreview,
})

function ReactionPreview() {
  if (!import.meta.env.DEV) return <Navigate to="/" replace />

  const lintBot = { kind: "agent" as const, name: "LintBot", icon: "🧹" }
  const codex = { kind: "agent" as const, name: "Codex", icon: "🔍" }
  const scout = { kind: "agent" as const, name: "Scout", icon: "🦉" }
  const human = { kind: "human" as const, name: "human", icon: null }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:px-8 lg:px-12">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-panel border border-hair-strong bg-panel shadow-card">
        <header className="border-b border-hair px-5 py-4 sm:px-6">
          <p className="font-mono text-2xs text-muted">reaction treatment preview</p>
          <h1 className="mt-1 text-sm font-semibold text-ink">Agent reaction identity</h1>
        </header>

        <div className="px-5 py-5 sm:px-6">
          <div className="divide-y divide-hair border-y border-hair">
            <Treatment label="A · Split" note="Reaction is a marker; identity owns the only pill.">
              <PreviewThread treatment="split" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="B · Unified" note="One shell contains the reaction and identity.">
              <PreviewThread treatment="unified" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="C · Nested" note="Current treatment, kept here as the baseline.">
              <PreviewThread treatment="nested" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="D · Ledger" note="A reaction reads as an activity sentence, with no container.">
              <PreviewThread treatment="ledger" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="E · Roster" note="Actors and signals form a compact two-column review roster.">
              <PreviewThread treatment="roster" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="F · Timeline" note="Every reaction is a small event, easy to scan in a busy thread.">
              <PreviewThread treatment="timeline" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>

            <Treatment label="G · Markers" note="Reaction glyphs dock onto lightweight identity markers, not chips.">
              <PreviewThread treatment="markers" human={human} codex={codex} scout={scout} lintBot={lintBot} />
            </Treatment>
          </div>
        </div>
      </section>
    </main>
  )
}

function Treatment({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-4">
      <div className="w-28 shrink-0">
        <p className="text-xs font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-2xs leading-snug text-muted">{note}</p>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

type TreatmentStyle = "split" | "unified" | "nested" | "ledger" | "roster" | "timeline" | "markers"

function PreviewThread({
  treatment,
  human,
  codex,
  scout,
  lintBot,
}: {
  treatment: TreatmentStyle
  human: { kind: "human"; name: string; icon: null }
  codex: { kind: "agent"; name: string; icon: string }
  scout: { kind: "agent"; name: string; icon: string }
  lintBot: { kind: "agent"; name: string; icon: string }
}) {
  return (
    <div className="space-y-2">
      <PreviewComment author={human} body="Human comment: should this validation run before the request is retried?">
        <ReactionRow
          treatment={treatment}
          humanEmoji="👍"
          reactions={[
            { emoji: "👀", agent: scout },
            { emoji: "🚧", agent: codex },
            { emoji: "🧪", agent: lintBot },
          ]}
        />
        <PreviewReply author={codex} body="Agent reply: yes — the retry path needs an explicit bound.">
          <ReactionRow
            treatment={treatment}
            humanEmoji="💯"
            reactions={[
              { emoji: "✅", agent: lintBot },
              { emoji: "🔍", agent: scout },
            ]}
          />
        </PreviewReply>
      </PreviewComment>
    </div>
  )
}

function ReactionEvent({ label, icon, emoji }: { label: string; icon?: string; emoji: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-4 place-items-center rounded-full bg-control text-2xs text-muted">{icon ?? "●"}</span>
      <span className="min-w-0 flex-1 truncate text-text">{label}</span>
      <span className="text-sm leading-none">{emoji}</span>
    </div>
  )
}

function ReactionMarker({ label, icon, emoji }: { label: string; icon?: string; emoji: string }) {
  return (
    <span className="relative inline-flex min-w-10 flex-col items-center gap-0.5 text-2xs text-muted">
      <span className="grid size-5 place-items-center rounded-[6px] bg-control text-xs">{icon ?? "◉"}</span>
      <span className="max-w-16 truncate">{label}</span>
      <span className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-surface text-[9px] ring-1 ring-hair-strong">{emoji}</span>
    </span>
  )
}

function PreviewComment({ author, body, children }: { author: Parameters<typeof AuthorBadge>[0]["author"]; body: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-ctrl px-2.5 py-2 ring-1 ring-inset ${author.kind === "agent" ? "bg-accent-softer ring-accent-edge" : "bg-soft ring-hair-strong"}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <AuthorBadge author={author} size="sm" />
        <span className="text-2xs text-muted">now</span>
      </div>
      <p className="text-xs leading-[1.5] text-text">{body}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function PreviewReply({ author, body, children }: { author: Parameters<typeof AuthorBadge>[0]["author"]; body: string; children: React.ReactNode }) {
  return (
    <div className={`mt-2 rounded-ctrl px-2.5 py-2 ring-1 ring-inset ${author.kind === "agent" ? "bg-accent-softer ring-accent-edge" : "bg-soft ring-hair-strong"}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <AuthorBadge author={author} size="sm" />
        <span className="text-2xs text-muted">now</span>
      </div>
      <p className="text-xs leading-[1.5] text-text">{body}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function ReactionRow({
  treatment,
  humanEmoji,
  reactions,
}: {
  treatment: TreatmentStyle
  humanEmoji: string
  reactions: { emoji: string; agent: { kind: "agent"; name: string; icon: string } }[]
}) {
  if (treatment === "ledger") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs text-muted">
        <span className="text-ink">you {humanEmoji}</span>
        {reactions.map(({ emoji, agent }) => (
          <span key={`${agent.name}-${emoji}`} className="inline-flex items-center gap-1">
            <AuthorBadge author={agent} size="sm" appearance="bare" />
            <span className="text-sm leading-none">{emoji}</span>
          </span>
        ))}
      </div>
    )
  }

  if (treatment === "roster") {
    return (
      <div className="grid max-w-sm grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-2xs">
        <span className="pb-1 font-mono uppercase tracking-wide text-faint">actor</span>
        <span className="pb-1 font-mono uppercase tracking-wide text-faint">signal</span>
        <span className="flex items-center border-t border-hair py-1.5 text-text">you</span>
        <span className="border-t border-hair py-1.5 text-right text-sm leading-none">{humanEmoji}</span>
        {reactions.map(({ emoji, agent }) => (
          <div key={`${agent.name}-${emoji}`} className="contents">
            <span className="flex items-center border-t border-hair py-1.5"><AuthorBadge author={agent} size="sm" appearance="bare" /></span>
            <span className="border-t border-hair py-1.5 text-right text-sm leading-none">{emoji}</span>
          </div>
        ))}
      </div>
    )
  }

  if (treatment === "timeline") {
    return (
      <div className="space-y-1.5 border-t border-hair pt-1.5 text-2xs">
        <ReactionEvent label="you" emoji={humanEmoji} />
        {reactions.map(({ emoji, agent }) => <ReactionEvent key={`${agent.name}-${emoji}`} label={agent.name} icon={agent.icon} emoji={emoji} />)}
      </div>
    )
  }

  if (treatment === "markers") {
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <ReactionMarker label="you" emoji={humanEmoji} />
        {reactions.map(({ emoji, agent }) => <ReactionMarker key={`${agent.name}-${emoji}`} label={agent.name} icon={agent.icon} emoji={emoji} />)}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2 text-xs leading-none text-accent-bright ring-1 ring-inset ring-accent-edge">
        {humanEmoji}
      </span>
      {reactions.map(({ emoji, agent }) => (
        <ReactionIdentity key={`${agent.name}-${emoji}`} treatment={treatment} emoji={emoji} agent={agent} />
      ))}
    </div>
  )
}

function ReactionIdentity({
  treatment,
  emoji,
  agent,
}: {
  treatment: TreatmentStyle
  emoji: string
  agent: { kind: "agent"; name: string; icon: string }
}) {
  if (treatment === "split") {
    return (
      <div className="flex h-[22px] items-center gap-1.5">
        <span aria-label="Testing reaction" className="text-sm leading-none">{emoji}</span>
        <AuthorBadge author={agent} size="sm" />
      </div>
    )
  }

  if (treatment === "unified") {
    return (
      <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-softer px-2 text-xs ring-1 ring-inset ring-accent-edge">
        <span aria-label="Testing reaction" className="text-xs leading-none">{emoji}</span>
        <AuthorBadge author={agent} size="sm" appearance="bare" />
      </span>
    )
  }

  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-softer pl-2 pr-0 text-xs ring-1 ring-inset ring-accent-edge">
      <span aria-label="Testing reaction" className="text-xs leading-none">{emoji}</span>
      <AuthorBadge author={agent} size="sm" />
    </span>
  )
}
