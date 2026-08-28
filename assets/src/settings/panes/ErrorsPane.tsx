import { observer } from "mobx-react-lite"

import { PaneHead } from "./pane-parts"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion"
import { errorLogStore, type LoggedError } from "../../stores/error-log-store"

export const ErrorsPane = observer(function ErrorsPane() {
  const entries = errorLogStore.entries

  return (
    <div className="flex flex-col gap-6">
      <PaneHead
        title="Errors"
        lede="What this browser has hit since collecting was switched on, newest first. The last 50 are kept, here and nowhere else."
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">
            Collected{entries.length > 0 && ` (${entries.length})`}
          </span>
          <span className="flex-1" />
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => errorLogStore.clear()}
              className="inline-flex h-[28px] items-center rounded-ctrl px-2.5 text-xs font-medium text-muted hover:bg-soft hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="rounded-[10px] border border-hair bg-soft px-3.5 py-3 text-xs leading-[1.5] text-muted">
            Nothing yet. Errors will appear here as they happen.
          </p>
        ) : (
          <Accordion className="gap-1.5">
            {entries.map((entry) => (
              <ErrorRow key={entry.id} entry={entry} />
            ))}
          </Accordion>
        )}
      </div>
    </div>
  )
})

const KIND_LABEL: Record<LoggedError["kind"], string> = {
  error: "Error",
  rejection: "Promise",
  render: "Render",
}

function ErrorRow({ entry }: { entry: LoggedError }) {
  const detail = [entry.source, entry.stack].filter(Boolean).join("\n\n")

  return (
    <AccordionItem value={entry.id} className="overflow-hidden rounded-[10px] border border-hair bg-soft">
      <AccordionTrigger className="rounded-none px-3 py-2.5 hover:bg-canvas">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs font-medium text-ink">{entry.message}</span>
          <span className="text-2xs text-faint">
            {KIND_LABEL[entry.kind]} · {new Date(entry.at).toLocaleString()}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pl-0">
        <pre className="max-h-[240px] overflow-auto border-t border-hair bg-canvas px-3 py-2.5 font-mono text-2xs leading-[1.5] whitespace-pre-wrap text-muted">
          {detail || "No further detail was captured."}
        </pre>
      </AccordionContent>
    </AccordionItem>
  )
}
