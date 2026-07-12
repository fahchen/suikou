import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronDown, Code2, CornerDownRight, Loader2 } from "lucide-react"

import { ConfirmDialog } from "../../../components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu"
import { INLINE_COMMENT_MAX_WIDTH_CLASS, TYPE_OPTIONS, safeDraft, type CritiqueType } from "./shared"

export function Composer({
  anchorLabel,
  initialType = "fix_required",
  initialBody = "",
  draftKey,
  submitLabel = "Add",
  pending,
  className = `my-1.5 ml-14 mr-3.5 ${INLINE_COMMENT_MAX_WIDTH_CLASS}`,
  chrome = true,
  suggestSeed,
  onSubmit,
  onCancel,
}: {
  anchorLabel: string | null
  initialType?: CritiqueType
  initialBody?: string
  draftKey?: string
  submitLabel?: string
  pending?: boolean
  className?: string
  chrome?: boolean
  suggestSeed?: string
  onSubmit: (body: string, type: CritiqueType) => void
  onCancel: () => void
}) {
  const withType = anchorLabel !== null
  const [type, setType] = useState<CritiqueType>(
    () => (draftKey ? safeDraft(localStorage.getItem(draftKey))?.type : undefined) ?? initialType,
  )
  const [body, setBody] = useState<string>(
    () => (draftKey ? safeDraft(localStorage.getItem(draftKey))?.body : undefined) ?? initialBody,
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const activeDraftKey = useRef(draftKey)

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  useEffect(() => {
    if (activeDraftKey.current !== draftKey) {
      activeDraftKey.current = draftKey
      const draft = draftKey ? safeDraft(localStorage.getItem(draftKey)) : null
      setType(draft?.type ?? initialType)
      setBody(draft?.body ?? initialBody)
      return
    }
    if (!draftKey) return
    if (body.trim()) localStorage.setItem(draftKey, JSON.stringify({ type, body }))
    else localStorage.removeItem(draftKey)
  }, [type, body, draftKey, initialType, initialBody])

  const hasText = body.trim().length > 0

  const submit = () => {
    const text = body.trim()
    if (!text) return
    if (draftKey) localStorage.removeItem(draftKey)
    onSubmit(text, type)
  }

  const insertSuggestion = () => {
    const fence = "```suggestion\n" + (suggestSeed ?? "") + "\n```\n"
    setBody((prev) => (prev.trim() ? prev.replace(/\s*$/, "\n\n") : "") + fence)
    requestAnimationFrame(() => areaRef.current?.focus())
  }

  const cancelNow = () => {
    if (draftKey) localStorage.removeItem(draftKey)
    onCancel()
  }

  const requestCancel = () => {
    if (hasText) setConfirmDiscard(true)
    else cancelNow()
  }

  const discard = () => {
    setConfirmDiscard(false)
    cancelNow()
  }

  const current = TYPE_OPTIONS.find((option) => option.value === type) ?? TYPE_OPTIONS[0]

  return (
    <div
      className={`overflow-hidden font-sans ${
        chrome ? "rounded-panel border border-hair-strong bg-surface shadow-lg" : ""
      } ${className}`}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        {anchorLabel && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <CornerDownRight size={12} aria-hidden />
            {anchorLabel}
          </span>
        )}
        <span className="flex-1" />
        {withType && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-hair-strong bg-canvas px-2.5 text-[11px] font-semibold text-text hover:bg-soft"
                >
                  <span className={`size-2 rounded-full ${current.dot}`} aria-hidden />
                  {current.label}
                  <ChevronDown size={12} className="text-faint" aria-hidden />
                </button>
              }
            />
            <DropdownMenuContent>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} selected={option.value === type} onClick={() => setType(option.value)}>
                  <span className={`size-2 shrink-0 rounded-full ${option.dot}`} aria-hidden />
                  <option.Icon size={13} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1">{option.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="px-3 pb-3">
        <textarea
          ref={areaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              requestCancel()
            }
          }}
          rows={2}
          placeholder={withType ? "Leave a comment..." : "Write a reply..."}
          className="block max-h-[240px] min-h-[58px] w-full resize-none overflow-y-auto rounded-ctrl border border-hair-strong bg-canvas px-2.5 py-2 text-[12.5px] leading-[1.5] text-ink placeholder:text-faint focus:border-accent-edge focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          {suggestSeed !== undefined && (
            <button
              type="button"
              onClick={insertSuggestion}
              title="Insert a code suggestion"
              className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-ctrl border border-hair-strong bg-canvas px-3 text-[12px] font-medium text-text hover:bg-soft"
            >
              <Code2 size={13} className="text-muted" aria-hidden />
              Suggest
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={cancelNow}
            className="h-[28px] cursor-pointer rounded-ctrl px-3 text-[12px] font-medium text-muted hover:bg-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || pending}
            className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-ctrl bg-accent px-3.5 text-[12px] font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitLabel}
            {pending ? (
              <Loader2 size={12} className="animate-spin opacity-90" aria-hidden />
            ) : (
              <span className="text-[11px] opacity-80">⌘⏎</span>
            )}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        body="Your unsaved text will be lost."
        confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={discard}
      />
    </div>
  )
}
