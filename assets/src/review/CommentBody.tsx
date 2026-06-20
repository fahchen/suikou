import { useMemo } from "react";

import { renderCommentBody } from "../markdown/render";

/**
 * Renders a comment or reply body as GFM markdown at the compact card scale.
 * The HTML comes from `renderCommentBody`, which escapes embedded HTML and
 * rejects script URLs, so the `dangerouslySetInnerHTML` sink is safe.
 */
export function CommentBody(props: { body: string }) {
  const html = useMemo(() => renderCommentBody(props.body), [props.body]);
  return (
    <div
      className="md-content md-comment min-w-0 break-words text-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
