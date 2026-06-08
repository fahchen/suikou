import { createFileRoute } from "@tanstack/react-router"
import { observer } from "mobx-react-lite"

import { uiStore } from "../stores/ui-store"
import { Editor } from "../review/Editor"
import { useReviewView } from "../review/store-context"

const RawEditorRoute = observer(function RawEditorRoute() {
  const { snapshot, blocks, loading, comments } = useReviewView()
  return (
    <Editor
      view="raw"
      content={snapshot.current_round.content}
      blocks={blocks}
      loading={loading}
      comments={comments}
      inline={uiStore.commentMode !== "side"}
    />
  )
})

export const Route = createFileRoute("/review/$artifactId/raw")({
  component: RawEditorRoute
})
