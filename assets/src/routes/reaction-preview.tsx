import { Navigate, createFileRoute } from "@tanstack/react-router"

import { AuthorBadge } from "../review/components/comments/AuthorBadge"

export const Route = createFileRoute("/reaction-preview")({
  component: ReactionPreview,
})

function ReactionPreview() {
  if (!import.meta.env.DEV) return <Navigate to="/" replace />

  const agent = { kind: "agent" as const, name: "LintBot", icon: "🧹" }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:px-8 lg:px-12">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-panel border border-hair-strong bg-panel shadow-card">
        <header className="border-b border-hair px-5 py-4 sm:px-6">
          <p className="font-mono text-2xs text-muted">reaction treatment preview</p>
          <h1 className="mt-1 text-sm font-semibold text-ink">Agent reaction identity</h1>
        </header>

        <div className="px-5 py-5 sm:px-6">
          <p className="max-w-[65ch] text-sm leading-relaxed text-text">
            Test agent comment: verify the shared avatar-and-name badge in a new thread.
          </p>

          <div className="mt-5 divide-y divide-hair border-y border-hair">
            <Treatment label="A · Split" note="Reaction is a marker; identity owns the only pill.">
              <span aria-label="Testing reaction" className="text-sm leading-none">🧪</span>
              <AuthorBadge author={agent} size="sm" />
            </Treatment>

            <Treatment label="B · Unified" note="One shell contains the reaction and identity.">
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-softer px-2 text-xs ring-1 ring-inset ring-accent-edge">
                <span aria-label="Testing reaction" className="text-xs leading-none">🧪</span>
                <AuthorBadge author={agent} size="sm" appearance="bare" />
              </span>
            </Treatment>

            <Treatment label="C · Nested" note="Current treatment, kept here as the baseline.">
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-accent-softer pl-2 pr-0 text-xs ring-1 ring-inset ring-accent-edge">
                <span aria-label="Testing reaction" className="text-xs leading-none">🧪</span>
                <AuthorBadge author={agent} size="sm" />
              </span>
            </Treatment>
          </div>
        </div>
      </section>
    </main>
  )
}

function Treatment({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-4 py-3">
      <div className="w-28 shrink-0">
        <p className="text-xs font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-2xs leading-snug text-muted">{note}</p>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}
