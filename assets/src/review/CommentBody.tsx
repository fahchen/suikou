import { useMemo } from "react";

import { renderCommentBody } from "../markdown/render";

/**
 * Renders a comment or reply body as GFM markdown at the compact card scale.
 * The HTML comes from `renderCommentBody`, which escapes embedded HTML and
 * rejects script URLs, so the `dangerouslySetInnerHTML` sink is safe.
 *
 * `clamp` folds the rendered body to a 3-line preview (Notion-style) for the
 * unselected rail card in E14; the caller drops it once the card is focused.
 */
export function CommentBody(props: { body: string; clamp?: boolean }) {
  const html = useMemo(() => renderCommentBody(props.body), [props.body]);
  return (
    <div
      className={`md-content md-comment min-w-0 break-words text-text ${
        props.clamp ? "line-clamp-3 [&_*]:!my-0" : ""
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
