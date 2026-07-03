import { Dices, X } from "lucide-react"

// A spread of project-flavored glyphs for the "surprise me" button.
const RANDOM_POOL = [
  "📁", "🗂️", "📦", "🚀", "🛠️", "⚙️", "🔧", "🧪", "🧩", "🎨",
  "📊", "🔬", "🌐", "💾", "🗄️", "🔑", "🐙", "🦀", "🐍", "⚡",
  "🌱", "🔮", "📝", "🧠", "🛰️", "🧭", "🗺️", "🔭", "🪐", "🌊",
  "🔥", "❄️", "🌈", "🍀", "🌸", "🍁", "🦊", "🐳", "🦉", "🐝",
  "🎯", "🧱", "📮", "🔒", "🧬", "⚗️", "🔩", "🪄", "🎬", "🧊",
]

const EMOJI = /\p{Extended_Pictographic}/u

/** Reduce arbitrary input to a single emoji: the last emoji grapheme in it. A
 * paste, or the OS panel inserting into an existing value, still yields one
 * emoji; non-emoji text (a stray pasted word) yields null. */
function lastEmoji(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const graphemes =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map(
          (part) => part.segment,
        )
      : [...trimmed]
  for (let i = graphemes.length - 1; i >= 0; i -= 1) {
    if (EMOJI.test(graphemes[i])) return graphemes[i]
  }
  return null
}

/** Single-emoji badge input rendered by the system emoji font. The user picks
 * with their OS emoji panel (⌃⌘Space on macOS, the emoji key on mobile) or
 * pastes one; the field keeps only the last emoji. `value` is null when empty. */
export function EmojiPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          value={value ?? ""}
          onChange={(event) => onChange(lastEmoji(event.target.value))}
          placeholder="🙂"
          aria-label="Emoji"
          className="size-[40px] shrink-0 rounded-ctrl border border-hair-strong bg-canvas text-center text-[20px] leading-none placeholder:opacity-40 focus:border-accent-edge focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)])}
          className="inline-flex h-[32px] items-center gap-1.5 rounded-ctrl bg-soft px-2.5 text-[12px] font-medium text-text hover:bg-control"
        >
          <Dices size={14} aria-hidden />
          Random
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={value === null}
          className="inline-flex h-[32px] items-center gap-1.5 rounded-ctrl px-2.5 text-[12px] font-medium text-muted hover:bg-soft disabled:opacity-40"
        >
          <X size={14} aria-hidden />
          Clear
        </button>
      </div>
      <p className="text-[11px] text-faint">
        Pick from your system emoji panel (⌃⌘Space on macOS), or paste one.
      </p>
    </div>
  )
}
