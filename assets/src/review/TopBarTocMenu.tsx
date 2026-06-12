import { List } from "lucide-react";

import { useOutline } from "./use-outline";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Outline of the current file: markdown headings, or a Tree-sitter symbol tree. */
export function TopBarTocMenu(props: { content: string; path: string }) {
  const { items, loading } = useOutline(props.content, props.path);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="pill"
            size="icon-xs"
            title="Table of contents"
          >
            <List className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="max-h-[70vh] w-64 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-1.5 text-[12px] text-faint">Parsing outline…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-faint">No outline.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <a
                key={`${item.line}-${item.text}`}
                href={`#line-${item.line}`}
                className="flex items-center justify-between rounded px-2 py-1 text-[13px] hover:bg-hover"
                style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              >
                <span className="truncate">{item.text}</span>
                <span className="ml-2 text-faint">{item.line}</span>
              </a>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
