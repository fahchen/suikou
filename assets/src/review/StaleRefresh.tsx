import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Marks a file whose source changed on disk since it was loaded: a compact
 * amber reload button. Rendered only while the file is stale. */
export function StaleRefresh(props: { onRefresh: () => void }) {
  return (
    <Button
      variant="pill"
      size="icon-xs"
      onClick={props.onRefresh}
      title="Changed on disk — reload"
      aria-label="Changed on disk — reload"
      className="text-amber hover:text-amber"
    >
      <RotateCw />
    </Button>
  )
}
