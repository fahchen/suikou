import { List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Heading outline of the current round, derived from the markdown source. */
export function TopBarTocMenu(props: { content: string }) {
  const toc = tableOfContents(props.content);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" title="Table of contents">
            <List size={16} />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-0.5">
          {toc.map((item) => (
            <a
              key={item.line}
              href={`#line-${item.line}`}
              className="flex items-center justify-between rounded px-2 py-1 text-[13px] hover:bg-hover"
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
            >
              <span className="truncate">{item.text}</span>
              <span className="ml-2 text-faint">{item.line}</span>
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function tableOfContents(content: string): { level: number; text: string; line: number }[] {
  const items: { level: number; text: string; line: number }[] = [];
  let inFence = false;

  content.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,4})\s+(.*)/.exec(line);
    if (match) {
      items.push({ level: match[1].length, text: match[2].trim(), line: index + 1 });
    }
  });

  return items;
}
