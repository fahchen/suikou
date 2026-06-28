import {
  Component,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { Check, Copy, RotateCw, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"

// Dep frames are dimmed in the displayed stack (the Deps toggle controls whether
// they're present at all — this only greys the ones that survive the filter).
const DEP_RE = /node_modules|\/deps\//

type OverlayProps = {
  error: Error
  componentStack?: string
  // The app subtree to keep mounted behind the overlay. Omitted when a route's
  // render threw (the subtree is the broken route) — closing then shows only the
  // reopen FAB.
  children?: ReactNode
}

// Presentational overlay + its close/reopen/copy interaction. Driven by an
// `error` from either the class boundary below (async/global + non-route render
// errors) or the router's `defaultErrorComponent` (route render errors).
export function ErrorOverlay({ error, componentStack, children }: OverlayProps) {
  const [visible, setVisible] = useState(true)
  const [copied, setCopied] = useState(false)
  const [remapped, setRemapped] = useState<string | null>(null)
  const [includeDeps, setIncludeDeps] = useState(false)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A new error (new object identity) re-pops the overlay even if the user had
  // closed the previous one.
  useEffect(() => setVisible(true), [error])
  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    },
    [],
  )

  // Lazily remap the stack to original source positions (source-map-js is only
  // imported here, when an error is shown). Re-runs when the deps filter flips.
  useEffect(() => {
    const stack = error.stack
    if (!stack) {
      setRemapped(null)
      return
    }
    let cancelled = false
    setRemapped(null)
    void (async () => {
      try {
        const { remapStack } = await import("@/lib/remap-stack")
        const mapped = await remapStack(stack, { includeDeps })
        if (!cancelled) setRemapped(mapped)
      } catch {
        // keep raw stack
      }
    })()
    return () => {
      cancelled = true
    }
  }, [error, includeDeps])

  const buildPayload = (): string =>
    [
      `${error.name}: ${error.message}`,
      "",
      "Stack:",
      remapped ?? error.stack ?? "(no stack)",
      "",
      "Component stack:",
      componentStack ?? "(none)",
      "",
      `URL: ${location.href}`,
      `UA: ${navigator.userAgent}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n")

  const handleCopy = async (): Promise<void> => {
    const payload = buildPayload()
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) ok = legacyCopy(payload)
    if (ok) {
      setCopied(true)
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
      copyResetTimer.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!visible) {
    return (
      <>
        {children}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setVisible(true)}
          aria-label="Show captured error"
          className="fixed right-4 bottom-4 z-50 shadow-[var(--elev-2)]"
        >
          <TriangleAlert />
          Error
        </Button>
      </>
    )
  }

  const displayStack = remapped ?? error.stack ?? "(no stack)"

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-text">
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <header className="flex items-start gap-3 rounded-xl bg-red-soft px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red" />
          <div className="min-w-0">
            <div className="font-mono text-[0.7rem] font-medium tracking-wider text-red uppercase">
              {error.name}
            </div>
            <h1 className="mt-0.5 text-base font-semibold break-words text-heading">
              {error.message || "(no message)"}
            </h1>
          </div>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <Meta label="URL" value={location.href} />
          <Meta label="Time" value={new Date().toISOString()} />
          <Meta label="Agent" value={navigator.userAgent} />
        </dl>

        <StackPanel label="Call stack" stack={displayStack}>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-pressed={includeDeps}
            onClick={() => setIncludeDeps((v) => !v)}
          >
            {includeDeps ? "Deps shown" : "Deps hidden"}
          </Button>
        </StackPanel>

        {componentStack ? <StackPanel label="Component stack" stack={componentStack} /> : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3">
        <Button type="button" variant="ghost" size="default" onClick={() => location.reload()}>
          <RotateCw />
          Reload
        </Button>
        <Button type="button" variant="outline" size="default" onClick={() => setVisible(false)}>
          <X />
          Close
        </Button>
        <Button type="button" variant="default" size="default" onClick={handleCopy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy report"}
        </Button>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono tracking-wide text-faint uppercase">{label}</dt>
      <dd className="font-mono break-all text-text2">{value}</dd>
    </>
  )
}

function StackPanel({
  label,
  stack,
  children,
}: {
  label: string
  stack: string
  children?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-editor">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
        <span className="font-mono text-[0.7rem] tracking-wider text-faint uppercase">{label}</span>
        {children}
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {stack.split("\n").map((line, i) => (
          <div key={i} className={DEP_RE.test(line) ? "text-faint" : "text-text2"}>
            {line || " "}
          </div>
        ))}
      </pre>
    </section>
  )
}

type Props = { children: ReactNode }

type State = {
  error: Error | null
  componentStack?: string
}

// Catches React render errors above the router (MusubiProvider, root mount) and
// global async errors (window error / unhandledrejection). Route render errors
// are caught by the router's defaultErrorComponent instead, which renders the
// same ErrorOverlay.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(_error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? undefined })
  }

  componentDidMount(): void {
    window.addEventListener("error", this.handleWindowError)
    window.addEventListener("unhandledrejection", this.handleRejection)
  }

  componentWillUnmount(): void {
    window.removeEventListener("error", this.handleWindowError)
    window.removeEventListener("unhandledrejection", this.handleRejection)
  }

  // Global errors carry no component stack, so clear any stale one left by a
  // prior render error — otherwise the overlay shows an unrelated component
  // stack alongside the new error.
  private handleWindowError = (event: ErrorEvent): void => {
    // Benign browser quirk, not an app error: a ResizeObserver callback resized
    // an element in the same frame, so the browser deferred the rest to the next
    // frame and reports it as an uncaught "error". It self-recovers; surfacing it
    // would spam the overlay (notably the HTML preview on iOS Safari).
    if (event.message && /ResizeObserver loop/.test(event.message)) return
    const error =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || String(event.error ?? "Unknown error"))
    this.setState({ error, componentStack: undefined })
  }

  private handleRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason
    const error = reason instanceof Error ? reason : new Error(stringifyReason(reason))
    this.setState({ error, componentStack: undefined })
  }

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children
    return (
      <ErrorOverlay error={error} componentStack={componentStack}>
        {this.props.children}
      </ErrorOverlay>
    )
  }
}

// JSON.stringify throws on circular refs / BigInt, so guard it: a rejection
// must still be captured even when its reason can't be serialized.
function stringifyReason(reason: unknown): string {
  if (typeof reason === "string") return reason
  try {
    return JSON.stringify(reason) ?? String(reason)
  } catch {
    return String(reason)
  }
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.top = "0"
    ta.style.left = "0"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
