# Phase G — Verdict / Submit 验收

对照设计稿 `design/pages/review/states-light.html`（G 组，外加 H2 概览）逐张核对这
13 张截图。每张是图片 artifact，所以用 **artifact 级评论** + **per-file verdict** 来
review；图片没有行锚点。

## 打开地址

- **Dev 新 UI（Tailscale，手机/别的设备）：**
  `http://philz-m1.tail73adf.ts.net:5173/reviews/019f2f9f-490c-7a72-bc03-6914211c08c9`
- **Dev 新 UI（本地）：**
  `http://127.0.0.1:5173/reviews/019f2f9f-490c-7a72-bc03-6914211c08c9`

## 怎么 review

1. 从 navigator 逐张点开。
2. 和 mockup 一致 → 该文件设 **verdict = Approve**（file-head 的 chip）。
3. 有问题 → 留 **artifact 评论**（`fix_required` / `needs_answer` / `note`）。
4. 全部看完 → toolbar **Submit** → 选 review verdict → 确认发布。
5. 你提交后，agent 会接住你的评论（`review wait`）、改代码、逐条回复，你再看下一轮。

verdict 和评论都由你（human）操作（BDR-0018）；agent 只回复评论、改代码。

## 每张要看什么

### 桌面（对照 mockup 的 `.vchip` / `.submit-pop` / `.io-*` / `.statusbar`）

| 文件 | 展示 | 核对点 |
|------|------|--------|
| `desktop-g-01-overview-no-verdict` | 默认态，还没定 verdict | file-head 是虚线 "No verdict" chip；toolbar 有 Submit + Copy；inspector 概览显示 "No verdict yet" / "No open blockers" / 2·0·0 |
| `desktop-g-02-verdict-menu` | G1 verdict 菜单 | 三项 Approve / Request changes / Comment，图标配色对 |
| `desktop-g-03-request-changes-draft` | 设了草稿 verdict | chip 变红 + amber "未提交草稿" 小点；inspector 显示 "Request changes (draft)"；状态栏同步 |
| `desktop-g-04-submit-panel` | G3 submit 弹层 | 汇总出的 verdict 被选中；pending 评论数、draft verdict 数；Submit 按钮 |
| `desktop-g-05-submit-confirm` | G5 确认框 | 说清发布会做啥（评论、草稿 verdict、未解决 fix_required） |
| `desktop-g-06-copy-menu` | G7 copy 菜单 | Copy noteworthy / Copy all comments |
| `desktop-g-07-live-verdicts` | 实时更新 | 两个文件都 ✓、"2/2 reviewed"，无需刷新 |
| `desktop-g-08-dismiss-and-blockers` | G6 + H2 + G8 | verdict 菜单带 "Dismiss approval"；概览显示 "Review approved"；open-blocker 列表；已发布 thread 渲染 |
| `desktop-g-09-soft-gate` | G4 soft gate | 琥珀色、不阻断："N open fix_required. Approving anyway is allowed" |

### 移动（对照 `states-light-mobile.html`：`.fh-verdict` / `.sheet` / `.statusbar`）

| 文件 | 展示 | 核对点 |
|------|------|--------|
| `mobile-g-01-review` | 手机上的 review | app bar、thread、状态栏、图标版 verdict chip |
| `mobile-g-02-submit-sheet` | submit 变底部 sheet | verdict radio、计数、soft gate，以及 open-blocker 列表（没右栏也能看概览） |
| `mobile-g-03-files-sheet` | 文件导航底部 sheet | 过滤、树、每文件 blocker 徽标 / approved 点 |
| `mobile-g-04-icon-chip` | 手机 file-head 的 verdict chip | 只剩图标（无文字），保留草稿点 |

### 嵌套列表测试

1. 第一步
   - 子项 A
   - 子项 B
2. 第二步
   1. 子步骤 1
   2. 子步骤 2

## Markdown comment anchor fixtures

### Tight unordered list

- Alpha item
- Beta item with **bold text**
- Gamma item with `inline code`
- Delta item with a [link](https://example.com)

### Ordered list with a custom start

3. Third item
4. Fourth item
5. Fifth item

### Mixed nested list

1. Prepare the review
   - Open the file
   - Switch to preview
     1. Inspect the first nested row
     2. Inspect the second nested row
   - Add a comment
2. Submit the review
   1. Choose a verdict
      - Approve
      - Request changes
   2. Confirm submission

### Loose list with multi-line items

- This item contains a second source line
  that should remain part of the same commentable range.

- This item contains a paragraph after a blank line.

  The continuation should stay anchored to this item.

- Final loose item.

### Multi-line prose block

This paragraph begins on one source line,
continues across a second line,
and ends on a third line so its comment appears after the largest line number.

### Compact table rows

| ID | State | Expected interaction |
|----|-------|----------------------|
| A1 | Ready | This row opens its own comment composer |
| A2 | Pending | This row does not share a border with A1 |
| A3 | Done | This row remains independently selectable |

### Table cells with rich and long content

| Kind | Example | Expected rendering |
|------|---------|--------------------|
| Inline code | `renderMarkdownBlocks()` | Code remains inside this row |
| Emphasis | **Important** and _secondary_ | Formatting does not change row anchoring |
| Empty cell |  | The empty cell keeps the column grid intact |
| Long content | A deliberately long sentence that wraps on narrow screens and mobile devices | The row grows without overlapping the next row |
