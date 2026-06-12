import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Folder, ChevronDown } from "lucide-react";

import type { ArtifactSummary, ReviewSnapshot } from "./types";
import { useMediaQuery, MOBILE_QUERY } from "../hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface FileNode {
  type: "file";
  name: string;
  artifact: ArtifactSummary;
}

interface FolderNode {
  type: "folder";
  name: string;
  children: TreeNode[];
}

type TreeNode = FileNode | FolderNode;

/**
 * Collapses artifacts sharing a title to one entry, preferring the active one,
 * then the highest round. Several reviews can target the same file path.
 */
function dedupeByTitle(
  artifacts: ReadonlyArray<ArtifactSummary>,
  activeId: string,
): ArtifactSummary[] {
  const byTitle = new Map<string, ArtifactSummary>();
  for (const artifact of artifacts) {
    const kept = byTitle.get(artifact.title);
    if (!kept || kept.id === activeId) {
      if (!kept) byTitle.set(artifact.title, artifact);
      continue;
    }
    if (artifact.id === activeId || (artifact.latest_round ?? -1) > (kept.latest_round ?? -1)) {
      byTitle.set(artifact.title, artifact);
    }
  }
  return [...byTitle.values()];
}

/** Groups artifacts into a folder tree keyed by the "/"-segments of their titles. */
function buildTree(artifacts: ReadonlyArray<ArtifactSummary>): TreeNode[] {
  const root: FolderNode = { type: "folder", name: "", children: [] };
  for (const artifact of artifacts) {
    const parts = artifact.title.split("/");
    let dir = root;
    for (const segment of parts.slice(0, -1)) {
      let next = dir.children.find(
        (c): c is FolderNode => c.type === "folder" && c.name === segment,
      );
      if (!next) {
        next = { type: "folder", name: segment, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ type: "file", name: parts[parts.length - 1], artifact });
  }
  sortNodes(root.children);
  return root.children;
}

// Folders before files, each alphabetical by name.
function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name),
  );
  for (const node of nodes) if (node.type === "folder") sortNodes(node.children);
}

/** Title button that opens the artifact switcher for this project. */
export function TopBarArtifactMenu(props: { snapshot: ReviewSnapshot; rawView: boolean }) {
  const { snapshot, rawView } = props;
  const navigate = useNavigate();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [open, setOpen] = useState(false);

  function openArtifact(id: string) {
    setOpen(false);
    void navigate({
      to: rawView ? "/review/$artifactId/raw" : "/review/$artifactId",
      params: { artifactId: id },
    });
  }

  const trigger = (
    <Button variant="pill" size="xs" title="Switch artifact" className="h-[30px] min-w-0 px-2.5">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="hidden truncate text-[12px] font-medium text-heading sm:inline">
        {snapshot.artifact.title}
      </span>
      <ChevronDown size={13} className="shrink-0 text-faint" />
    </Button>
  );

  const tree = (
    <TreeLevel
      nodes={buildTree(dedupeByTitle(snapshot.artifacts, snapshot.artifact.id))}
      depth={0}
      activeId={snapshot.artifact.id}
      onOpen={openArtifact}
    />
  );

  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        <DialogContent className="max-h-[80vh] gap-3 overflow-y-auto p-3">
          <DialogTitle className="flex items-center gap-1.5 text-[12px] font-normal text-muted-foreground">
            <Folder size={14} /> artifacts
          </DialogTitle>
          <div className="flex flex-col gap-0.5">{tree}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="max-h-[70vh] w-72 overflow-y-auto p-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-foreground">
            <Folder size={13} /> artifacts
          </div>
          {tree}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TreeLevel(props: {
  nodes: TreeNode[];
  depth: number;
  activeId: string;
  onOpen: (id: string) => void;
}) {
  return props.nodes.map((node) =>
    node.type === "folder" ? (
      <FolderRow
        key={`folder:${node.name}`}
        node={node}
        depth={props.depth}
        activeId={props.activeId}
        onOpen={props.onOpen}
      />
    ) : (
      <FileRow
        key={node.artifact.id}
        node={node}
        depth={props.depth}
        active={node.artifact.id === props.activeId}
        onOpen={props.onOpen}
      />
    ),
  );
}

// Collapse single-folder chains (a → a/b/c) so deep paths cost one indent, not three.
function FolderRow(props: {
  node: FolderNode;
  depth: number;
  activeId: string;
  onOpen: (id: string) => void;
}) {
  let name = props.node.name;
  let children = props.node.children;
  while (children.length === 1 && children[0].type === "folder") {
    name = `${name}/${children[0].name}`;
    children = children[0].children;
  }

  return (
    <>
      <div
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-muted-foreground"
        style={{ paddingLeft: `${props.depth * 12 + 8}px` }}
      >
        <Folder size={13} className="shrink-0" />
        <span className="min-w-0 truncate">{name}</span>
      </div>
      <TreeLevel
        nodes={children}
        depth={props.depth + 1}
        activeId={props.activeId}
        onOpen={props.onOpen}
      />
    </>
  );
}

function FileRow(props: {
  node: FileNode;
  depth: number;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  const { artifact } = props.node;
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded py-1.5 pr-2 text-left text-[13px] ${
        props.active ? "bg-tint text-heading" : "hover:bg-hover"
      }`}
      style={{ paddingLeft: `${props.depth * 12 + 8}px` }}
      onClick={() => props.onOpen(artifact.id)}
    >
      <FileText size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{props.node.name}</span>
      <span className="shrink-0 text-[11px] text-faint">
        {artifact.latest_round ? `R${artifact.latest_round}` : "—"}
        {artifact.approved ? " · ready" : ""}
      </span>
    </button>
  );
}
