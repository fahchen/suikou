import type { ReactNode } from "react"

/** The heading and lede every settings pane opens with. */
export function PaneHead({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-base font-bold tracking-[-0.015em] text-ink">{title}</h3>
      {lede && <p className="max-w-[52ch] text-xs leading-[1.45] text-muted">{lede}</p>}
    </div>
  )
}

/** One labelled setting: name and explanation on the left, its control on the
 * right, separated from the row above. */
export function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-t border-hair pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs leading-[1.4] text-muted">{sub}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
