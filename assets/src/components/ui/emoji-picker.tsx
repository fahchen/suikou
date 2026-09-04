import { Dices } from "lucide-react"

import { Button } from "./button"

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

/** Project icon field: a single-emoji badge rendered by the system emoji font.
 * The user picks with their OS emoji panel (⌃⌘Space on macOS, the emoji key on
 * mobile), pastes one, or rolls a random one; the field keeps only the last
 * emoji. `value` is null when the field is empty. */
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
        {/* The glyph is painted by a centred span, not by the input: an emoji's
            own metrics leave it sitting off-centre inside a text field. */}
        <div className="relative size-[35px] shrink-0">
          <span
            className={`pointer-events-none absolute inset-0 grid place-items-center text-lg leading-none ${value ? "" : "opacity-40"}`}
            aria-hidden
          >
            {value ?? "🙂"}
          </span>
          <input
            value={value ?? ""}
            onChange={(event) => onChange(lastEmoji(event.target.value))}
            aria-label="Project icon"
            className="size-full rounded-ctrl border border-hair-strong bg-canvas text-center text-lg leading-none text-transparent caret-transparent focus-visible:border-accent-edge focus-visible:outline-none"
          />
        </div>
        <Button variant="outline" size="lg" onClick={() => onChange(RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)])}>
          <Dices size={14} aria-hidden />
          Random
        </Button>
      </div>
      <p className="text-xs text-faint">
        Pick from your system emoji panel (⌃⌘Space on macOS), or paste one. Empty the field for no icon.
      </p>
    </div>
  )
}
