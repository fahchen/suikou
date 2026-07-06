import { useEffect, useState } from "react"
import { Check, ChevronsUpDown, Folder, Search } from "lucide-react"

import { Dialog } from "../../components/ui/dialog"

export type ProjectNavProject = {
  id: string
  name: string
  emoji: string | null
}

export function MobileProjectBar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: ProjectNavProject[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = projects.find((project) => project.id === selectedId) ?? null

  return (
    <div className="shrink-0 border-b border-hair-strong bg-surface px-3 py-2 lg:hidden">
      <button
        onClick={() => setOpen(true)}
        disabled={projects.length === 0}
        className="flex h-[38px] w-full items-center gap-2.5 rounded-ctrl border border-hair-strong bg-canvas px-3 text-left disabled:opacity-60"
      >
        {selected ? (
          <ProjectGlyph project={selected} size={16} active />
        ) : (
          <Folder size={16} strokeWidth={1.7} className="text-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
          {selected?.name ?? "No projects"}
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-muted" aria-hidden />
      </button>
      <ProjectPickerSheet
        open={open}
        projects={projects}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelect(id)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

export function Sidebar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: ProjectNavProject[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <aside className="hidden flex-col border-r border-hair-strong bg-surface px-[9px] pt-3 pb-[9px] lg:flex">
      <div className="flex items-center gap-[7px] px-[9px] pt-[3px] pb-[9px] text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint">
        Projects
        <span aria-hidden className="h-px flex-1 bg-hair" />
      </div>
      <div className="flex flex-col gap-0.5">
        {projects.map((project) => {
          const active = project.id === selectedId
          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              aria-current={active ? "true" : undefined}
              className={`flex h-[34px] shrink-0 items-center gap-[9px] rounded-ctrl pr-[9px] pl-2.5 text-left text-[13px] tracking-[-0.008em] ${
                active
                  ? "bg-accent-soft font-semibold text-accent-bright shadow-[inset_0_0_0_1px_var(--accent-edge)]"
                  : "text-text hover:bg-soft"
              }`}
            >
              <ProjectGlyph project={project} size={16} active={active} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          )
        })}
      </div>
      <span className="flex-1" />
      <div className="flex items-center border-t border-hair px-[9px] pt-[9px] pb-0.5 text-[11px] text-faint">
        <span className="font-mono tabular-nums">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </span>
      </div>
    </aside>
  )
}

function ProjectPickerSheet({
  open,
  projects,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean
  projects: ProjectNavProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  const needle = query.trim().toLowerCase()
  const filtered = needle ? projects.filter((project) => project.name.toLowerCase().includes(needle)) : projects

  return (
    <Dialog open={open} onClose={onClose} className="max-h-[70vh] sm:max-w-[420px]">
      <div className="flex items-center gap-2 border-b border-hair px-3 py-3">
        <Search size={15} className="shrink-0 text-faint" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects…"
          className="h-[26px] flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-2">
        {filtered.map((project) => {
          const active = project.id === selectedId
          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              aria-current={active ? "true" : undefined}
              className={`flex h-[42px] shrink-0 items-center gap-2.5 rounded-ctrl px-3 text-left text-[13.5px] ${
                active ? "bg-accent-soft font-semibold text-accent-bright" : "text-text hover:bg-soft"
              }`}
            >
              <ProjectGlyph project={project} size={17} active={active} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {active && <Check size={16} strokeWidth={2.4} className="shrink-0 text-accent" aria-hidden />}
            </button>
          )
        })}
        {filtered.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-faint">No projects match.</p>}
      </div>
    </Dialog>
  )
}

function ProjectGlyph({
  project,
  size,
  active,
}: {
  project: ProjectNavProject
  size: number
  active?: boolean
}) {
  if (project.emoji) {
    return (
      <span aria-hidden className="shrink-0 leading-none" style={{ fontSize: size }}>
        {project.emoji}
      </span>
    )
  }

  return (
    <Folder
      size={size}
      strokeWidth={1.7}
      className={active ? "text-accent-bright" : "text-muted"}
      aria-hidden
    />
  )
}
