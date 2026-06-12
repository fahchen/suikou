import { File, FileCode, FileJson, FileText, Image, type LucideIcon } from "lucide-react"

interface IconSpec {
  Icon: LucideIcon
  className: string
}

// Distinct glyph per family, restrained tints drawn from the theme's semantic
// tokens so a file list never turns into a rainbow that fights the palette.
const MARKDOWN: IconSpec = { Icon: FileText, className: "text-blue" }
const CODE: IconSpec = { Icon: FileCode, className: "text-muted-foreground" }
const DATA: IconSpec = { Icon: FileJson, className: "text-amber" }
const IMAGE: IconSpec = { Icon: Image, className: "text-green" }
const PLAIN: IconSpec = { Icon: FileText, className: "text-faint" }
const UNKNOWN: IconSpec = { Icon: File, className: "text-faint" }

const BY_EXT: Record<string, IconSpec> = {
  md: MARKDOWN,
  markdown: MARKDOWN,
  mdx: MARKDOWN,
  ex: CODE,
  exs: CODE,
  heex: CODE,
  eex: CODE,
  ts: CODE,
  tsx: CODE,
  js: CODE,
  jsx: CODE,
  mjs: CODE,
  cjs: CODE,
  rs: CODE,
  go: CODE,
  py: CODE,
  rb: CODE,
  css: CODE,
  scss: CODE,
  html: CODE,
  sh: CODE,
  json: DATA,
  yml: DATA,
  yaml: DATA,
  toml: DATA,
  png: IMAGE,
  jpg: IMAGE,
  jpeg: IMAGE,
  gif: IMAGE,
  svg: IMAGE,
  webp: IMAGE,
  ico: IMAGE,
  txt: PLAIN,
  log: PLAIN,
  lock: PLAIN
}

function specFor(name: string): IconSpec {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  return BY_EXT[ext] ?? UNKNOWN
}

/** File glyph chosen from a path's extension, tinted on-theme. */
export function FileIcon({
  name,
  size = 13,
  className
}: {
  name: string
  size?: number
  className?: string
}) {
  const { Icon, className: tint } = specFor(name)
  return <Icon size={size} className={`shrink-0 ${tint} ${className ?? ""}`} />
}
