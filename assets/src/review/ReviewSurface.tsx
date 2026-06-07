import { observer } from "mobx-react-lite"

import { useMusubiSnapshot } from "../musubi"
import { uiStore } from "../stores/ui-store"
import { useMarkdown } from "../markdown/use-markdown"
import { useReviewStore, visibleComments } from "./store-context"
import { TopBar } from "./TopBar"
import { Editor } from "./Editor"
import { CommentRail } from "./CommentRail"
import type { ReviewSnapshot } from "./types"

export const ReviewSurface = observer(function ReviewSurface() {
  const store = useReviewStore()
  const snapshot = useMusubiSnapshot(store) as ReviewSnapshot
  const ui = uiStore

  const blocks = useMarkdown(snapshot.current_round.content, ui.theme)
  const comments = visibleComments(snapshot.comments, ui.statusFilter, ui.typeFilters)
  const sideMode = ui.commentMode === "side"

  return (
    <main className="flex h-screen flex-col bg-canvas text-ink">
      <TopBar snapshot={snapshot} />

      <div className="flex-1 overflow-auto">
        <div
          className="mx-auto grid w-full max-w-[1400px] gap-6 px-6 py-8"
          style={{ gridTemplateColumns: sideMode ? "minmax(0,1fr) 340px" : "minmax(0,1fr)" }}
        >
          <Editor
            content={snapshot.current_round.content}
            blocks={blocks.blocks}
            loading={blocks.loading}
            comments={comments}
            inline={!sideMode}
          />
          {sideMode && <CommentRail comments={comments} />}
        </div>
      </div>
    </main>
  )
})
