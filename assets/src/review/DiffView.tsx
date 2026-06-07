import { useReviewCommands } from "./commands"
import { CRITIQUE_META, VERDICT_META, type DiffComment, type RoundDiff } from "./types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, GitCompare, ArrowRight } from "lucide-react"

const SEGMENT_CLASS: Record<RoundDiff["text"][number]["op"], string> = {
  eq: "text-text",
  ins: "bg-green/15 text-green-text",
  del: "bg-red-soft text-red line-through",
}

export function DiffView(props: { diff: RoundDiff }) {
  const { diff } = props
  const commands = useReviewCommands()

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-editor">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <GitCompare size={15} className="text-muted-foreground" />
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-heading">
          R{diff.from} <ArrowRight size={13} className="text-faint" /> R{diff.to}
        </span>
        <VerdictDelta from={diff.verdict_from} to={diff.verdict_to} />
        <Button
          variant="ghost"
          size="icon-xs"
          title="Close diff"
          className="ml-auto"
          onClick={() => void commands.closeDiff.dispatch({})}
        >
          <X size={15} />
        </Button>
      </header>

      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {diff.text.map((segment, index) => (
          <span key={index} className={SEGMENT_CLASS[segment.op]}>
            {segment.value}
          </span>
        ))}
      </pre>

      {(diff.resolved.length > 0 ||
        diff.added.length > 0 ||
        diff.carried_forward.length > 0) && (
        <div className="grid gap-3 border-t border-line-soft px-4 py-3 sm:grid-cols-3">
          <TransitionGroup label="Resolved" tone="text-green-text" comments={diff.resolved} />
          <TransitionGroup label="Added" tone="text-blue" comments={diff.added} />
          <TransitionGroup
            label="Carried forward"
            tone="text-amber"
            comments={diff.carried_forward}
          />
        </div>
      )}
    </section>
  )
}

function VerdictDelta(props: { from: RoundDiff["verdict_from"]; to: RoundDiff["verdict_to"] }) {
  if (props.from === props.to) return null
  return (
    <span className="ml-2 flex items-center gap-1.5 text-[12px]">
      <span className="text-muted-foreground">
        {props.from ? VERDICT_META[props.from].label : "no verdict"}
      </span>
      <ArrowRight size={12} className="text-faint" />
      <span className="font-medium text-heading">
        {props.to ? VERDICT_META[props.to].label : "no verdict"}
      </span>
    </span>
  )
}

function TransitionGroup(props: { label: string; tone: string; comments: DiffComment[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">
        <span className={props.tone}>{props.label}</span>
        <Badge variant="secondary">{props.comments.length}</Badge>
      </div>
      {props.comments.map((comment) => (
        <div key={comment.id} className="rounded border border-line-soft bg-surface px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {CRITIQUE_META[comment.critique_type].short}
          </span>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-text">{comment.body}</p>
        </div>
      ))}
    </div>
  )
}
