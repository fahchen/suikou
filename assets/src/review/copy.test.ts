import { describe, it, expect } from "vitest";

import { buildReviewCopyText, type CopyFile } from "./copy";
import type { Comment } from "./types";

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    scope: "located",
    critique_type: "note",
    status: "published",
    body: "body",
    resolved: false,
    resolved_round: null,
    outdated: false,
    drifted: false,
    authored_round: 0,
    inserted_at: "2026-01-01T00:00:00Z",
    anchor: null,
    replies: [],
    ...overrides,
  };
}

function file(overrides: Partial<CopyFile> = {}): CopyFile {
  return { title: "f", round: 0, comments: [comment()], ...overrides };
}

describe("buildReviewCopyText", () => {
  it("renders an unresolved problem with type, anchor, quote, and body", () => {
    const text = buildReviewCopyText(
      "my review",
      [
        file({
          title: "auth.md",
          round: 2,
          comments: [
            comment({
              critique_type: "fix_required",
              body: "use <= here",
              anchor: { type: "line_range", start_line: 10, end_line: 12, quote: "a\nb" },
            }),
          ],
        }),
      ],
      "noteworthy",
    );

    expect(text).toContain("# Review: my review");
    expect(text).toContain("## auth.md — Round 2");
    expect(text).toContain("**Unresolved (1)**");
    expect(text).toContain("### [Fix required] L10–12");
    expect(text).toContain("> a\n> b");
    expect(text).toContain("use <= here");
  });

  it("collapses a single-line anchor and labels a missing anchor", () => {
    const single = buildReviewCopyText(
      "r",
      [
        file({
          comments: [
            comment({ anchor: { type: "line_range", start_line: 5, end_line: 5, quote: "x" } }),
          ],
        }),
      ],
      "noteworthy",
    );
    expect(single).toContain("L5");

    const none = buildReviewCopyText(
      "r",
      [file({ comments: [comment({ anchor: null })] })],
      "noteworthy",
    );
    expect(none).toContain("[Note] no anchor");
  });

  it("aggregates one section per file with comments", () => {
    const text = buildReviewCopyText(
      "r",
      [
        file({ title: "a.md", round: 1 }),
        file({ title: "b.md", round: 2, comments: [comment({ critique_type: "fix_required" })] }),
      ],
      "noteworthy",
    );

    expect(text).toContain("## a.md — Round 1");
    expect(text).toContain("## b.md — Round 2");
  });

  it("omits files with no problems for the chosen mode", () => {
    const text = buildReviewCopyText(
      "r",
      [
        file({ title: "empty.md", comments: [] }),
        file({ title: "resolved-only.md", comments: [comment({ resolved: true })] }),
      ],
      "noteworthy",
    );

    expect(text).not.toContain("## empty.md");
    expect(text).not.toContain("## resolved-only.md");
  });

  it("includes replies for unresolved problems", () => {
    const text = buildReviewCopyText(
      "r",
      [
        file({
          round: 1,
          comments: [
            comment({
              replies: [
                {
                  id: "r1",
                  author: "agent",
                  status: "published",
                  body: "fixed",
                  inserted_at: "2026-01-01T00:00:00Z",
                },
                {
                  id: "r2",
                  author: "human",
                  status: "published",
                  body: "still broken",
                  inserted_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
          ],
        }),
      ],
      "noteworthy",
    );

    expect(text).toContain("Replies:");
    expect(text).toContain("- agent: fixed");
    expect(text).toContain("- human: still broken");
  });

  it("omits the resolved section in noteworthy mode and includes it in all mode", () => {
    const comments = [comment({ id: "u" }), comment({ id: "r", resolved: true })];

    const noteworthy = buildReviewCopyText("r", [file({ round: 1, comments })], "noteworthy");
    expect(noteworthy).not.toContain("**Resolved");

    const all = buildReviewCopyText("r", [file({ round: 1, comments })], "all");
    expect(all).toContain("**Resolved (1)**");
  });

  it("drops replies from resolved problems in all mode", () => {
    const text = buildReviewCopyText(
      "r",
      [
        file({
          round: 1,
          comments: [
            comment({
              resolved: true,
              replies: [
                {
                  id: "r1",
                  author: "human",
                  status: "published",
                  body: "noise",
                  inserted_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
          ],
        }),
      ],
      "all",
    );

    expect(text).not.toContain("Replies:");
  });
});
