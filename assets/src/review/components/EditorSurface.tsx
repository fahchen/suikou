import { useState } from "react"
import { Binary, File, ListTree } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import type { OutlineItem } from "../../treesitter/outline"
export { HtmlView } from "./HtmlSurface"

export function TocMenu({ items, onJump }: { items: OutlineItem[]; onJump: (line: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-ctrl text-muted hover:bg-soft hover:text-ink"
            title="Outline"
          >
            <ListTree size={16} aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent>
        <div className="max-h-[60vh] w-[260px] overflow-auto">
          {items.map((item, index) => (
            <DropdownMenuItem key={`${item.line}-${index}`} onClick={() => onJump(item.line)}>
              <span
                style={{ paddingLeft: (item.level - 1) * 12 }}
                className="min-w-0 flex-1 truncate font-mono text-[12px]"
              >
                {item.text}
              </span>
              <span className="ml-2 shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{item.line}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const clampZoom = (zoom: number): number => Math.min(2, Math.max(0.1, Math.round(zoom * 10) / 10))

export function isTextMime(mime: string): boolean {
  const type = mime.split(";")[0].trim()
  if (type === "" || type === "application/octet-stream" || type === "image/svg+xml") return true
  if (type.startsWith("text/")) return true
  return /^application\/(json|javascript|xml|x-yaml|yaml|toml|x-sh|x-httpd-php|graphql|sql)$/.test(type)
}

export function ImageView({ name, url, mime, bytes }: { name: string; url: string; mime: string; bytes: number | null }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const format = mime.split("/")[1]?.split("+")[0]?.toUpperCase() ?? "IMAGE"
  const meta = [name, dims && `${dims.w}×${dims.h}`, bytes && formatBytes(bytes), format].filter(Boolean).join(" · ")

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6 [background:repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg-1)_0%_50%)_50%/18px_18px]">
      <figure className="max-w-[80%] overflow-hidden rounded-[12px] border border-hair-strong bg-soft shadow-[0_10px_30px_-10px_oklch(0%_0_0/0.28)]">
        <img
          src={url}
          alt={name}
          onLoad={(event) => setDims({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          className="block h-auto w-full"
        />
        <figcaption className="border-t border-hair-strong bg-control px-3 py-1.5 text-center font-mono text-[11px] text-muted">
          {meta}
        </figcaption>
      </figure>
    </div>
  )
}

export function BinaryNotice({ name, mime, bytes }: { name: string; mime: string; bytes: number | null }) {
  const meta = [name, bytes && formatBytes(bytes), mime].filter(Boolean).join(" · ")

  return (
    <FileNotice
      icon={Binary}
      title="Cannot render this file"
      body="This is a binary artifact. There is no text or visual representation to show, and no place to anchor a comment."
      meta={meta}
    />
  )
}

export function EmptyFileNotice({ name }: { name: string }) {
  return (
    <FileNotice
      icon={File}
      title="This file is empty"
      body="There's nothing to show or comment on in this file yet."
      meta={name}
    />
  )
}

function FileNotice({ icon: Icon, title, body, meta }: { icon: typeof Binary; title: string; body: string; meta?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[13px] px-8 py-12 text-center">
      <div className="grid size-[54px] place-items-center rounded-[16px] border border-hair-strong bg-soft text-muted shadow-[inset_0_0.5px_0_var(--edge-top-2)]">
        <Icon size={26} aria-hidden />
      </div>
      <h3 className="text-[15px] font-[680] text-ink">{title}</h3>
      <p className="max-w-[40ch] text-[12.5px] leading-[1.5] text-muted">{body}</p>
      {meta && <div className="rounded-full bg-control px-[11px] py-1 font-mono text-[11px] text-faint">{meta}</div>}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
