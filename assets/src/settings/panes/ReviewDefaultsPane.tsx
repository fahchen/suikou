import { observer } from "mobx-react-lite"

import { PaneHead, Row } from "./pane-parts"
import { Segmented } from "../../components/ui/segmented"
import { Switch } from "../../components/ui/switch"
import { uiStore, type CommentDisplayMode, type DiffStyle, type FileRange } from "../../stores/ui-store"

export const ReviewDefaultsPane = observer(function ReviewDefaultsPane() {
  return (
    <div className="flex flex-col gap-6">
      <PaneHead title="Review defaults" lede="How new reviews open until you change them per review." />
      <Row title="File layout" sub="Read one file at a time, or stack every file in one scroll. Desktop only.">
        <Segmented<FileRange>
          value={uiStore.fileRange}
          onChange={(v) => uiStore.setFileRange(v)}
          options={[
            ["single", "Single"],
            ["stacked", "Stacked"],
          ]}
        />
      </Row>
      <Row title="Comments" sub="Default placement for review comments on desktop. Mobile stays inline.">
        <Segmented<CommentDisplayMode>
          value={uiStore.commentDisplay}
          onChange={(v) => uiStore.setCommentDisplay(v)}
          options={[
            ["inline", "Inline"],
            ["side", "Side"],
            ["hidden", "Hidden"],
          ]}
        />
      </Row>
      <Row title="Diff view" sub="Unified stacks additions under deletions; split shows old and new side by side.">
        <Segmented<DiffStyle>
          value={uiStore.diffStyle}
          onChange={(v) => uiStore.setDiffStyle(v)}
          options={[
            ["unified", "Unified"],
            ["split", "Split"],
          ]}
        />
      </Row>
      <Row title="Word diff" sub="Highlight the exact words that changed inside paired del/add lines.">
        <Switch
          aria-label="Word diff"
          checked={uiStore.wordDiff}
          onCheckedChange={(v) => uiStore.setWordDiff(v)}
        />
      </Row>
    </div>
  )
})
