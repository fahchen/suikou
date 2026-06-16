import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

import type { RenderedBlock } from "../markdown/render";

// Editor pulls in Composer/CommentCard, which read matchMedia via useMediaQuery.
beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

const stubCmd = { dispatch: vi.fn(), isPending: false };

vi.mock("./commands", () => ({
  useReviewCommands: () => ({
    addComment: stubCmd,
    editComment: stubCmd,
    deleteComment: stubCmd,
    resolveComment: stubCmd,
    unresolveComment: stubCmd,
    reply: stubCmd,
    submitReview: stubCmd,
    setDraftVerdict: stubCmd,
    selectRound: stubCmd,
  }),
}));

import { Editor } from "./Editor";

function codeLine(startLine: number, text: string): RenderedBlock {
  return {
    startLine,
    endLine: startLine,
    kind: "code",
    tag: "",
    lang: "javascript",
    html: `<span style="color:#000">${text}</span>`,
  };
}

function renderEditor(blocks: RenderedBlock[]) {
  return render(
    <Editor
      view="rendered"
      content={blocks.map(() => "x").join("\n")}
      blocks={blocks}
      loading={false}
      comments={[]}
      rawLines={null}
      inline={false}
    />,
  );
}

describe("Editor rendered code fence", () => {
  it("wraps a run of code lines in one horizontal-scroll box", () => {
    const { container } = renderEditor([
      codeLine(2, "const a = 1"),
      codeLine(3, "const b = 2"),
      codeLine(4, "const c = 3"),
    ]);

    const boxes = container.querySelectorAll(".overflow-x-auto");
    expect(boxes.length).toBe(1);
    // Lines share one width wrapper so they scroll together and stay aligned.
    expect(boxes[0].querySelector(".w-max.min-w-full")).not.toBeNull();
  });

  it("keeps every code line independently anchorable", () => {
    renderEditor([
      codeLine(2, "const a = 1"),
      codeLine(3, "const b = 2"),
      codeLine(4, "const c = 3"),
    ]);

    expect(screen.getByRole("button", { name: "Add a comment on line 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a comment on line 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a comment on line 4" })).toBeTruthy();
  });

  it("leaves non-code blocks outside the scroll box", () => {
    const markdown: RenderedBlock = {
      startLine: 1,
      endLine: 1,
      kind: "markdown",
      tag: "p",
      lang: null,
      html: "<p>prose</p>",
    };
    const { container } = renderEditor([markdown, codeLine(3, "const a = 1")]);

    const box = container.querySelector(".overflow-x-auto");
    expect(box?.textContent).toContain("const a = 1");
    expect(box?.textContent).not.toContain("prose");
  });
});

function tableRow(startLine: number, cells: string): RenderedBlock {
  return { startLine, endLine: startLine, kind: "markdown", tag: "tr", lang: null, html: cells };
}

describe("Editor rendered table", () => {
  const ROWS = [
    tableRow(1, "<th>H1</th><th>H2</th>"),
    tableRow(3, "<td>a</td><td>b</td>"),
    tableRow(4, "<td>c</td><td>d</td>"),
  ];

  it("stitches the rows into one scrollable real table", () => {
    const { container } = renderEditor(ROWS);

    const boxes = container.querySelectorAll(".overflow-x-auto");
    expect(boxes.length).toBe(1);
    const tables = container.querySelectorAll("table.md-table");
    expect(tables.length).toBe(1);
    // Header cells stay in the one table alongside the body rows.
    expect(tables[0].querySelectorAll("th").length).toBe(2);
    expect(tables[0].textContent).toContain("a");
    expect(tables[0].textContent).toContain("d");
  });

  it("uses content-proportional columns, not the equal-width squeeze", () => {
    const { container } = renderEditor(ROWS);
    expect(container.innerHTML).not.toContain("table-layout");
    expect(container.innerHTML).not.toContain("<colgroup");
  });

  it("keeps every row independently anchorable", () => {
    renderEditor(ROWS);
    expect(screen.getByRole("button", { name: "Add a comment on line 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a comment on line 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a comment on line 4" })).toBeTruthy();
  });
});
