# Review 页 — 状态全集(states catalog)

> 总览见 `../../pages.md`,功能见 `spec.md`。本文件以 **reviewer 实际工作流** 视角,穷举 review 页所有可能状态,作为"先把状态做齐、再深化"的依据。每条标注:**何时出现 / 关键呈现 / 已有 mockup?**

图例:✅ = 现有 review mockup 已覆盖;➕ = 待补;◐ = 部分覆盖。

> **实现约束(fidelity worker 必读):这是一个全视口 WEB APP。** 不要复刻 storyboard(`states-codex.html`/mobile mockup)给每个 state 画的**外框**——那个圆角窗口面板 / 窗口 chrome / 手机 bezel 只是**排版用的展示框**(为了在一页里并排展示多个 state)。真 app 铺满浏览器视口,**没有外框/边框/bezel/假浏览器 chrome**。只把**框内的 app UI**(top bar / navigator / editor / comments / status bar)对齐到每个 state。已加了外框的要去掉。

---

## 0. Review kind(贯穿全局的最高轴:file_selection vs git_diff)

一个 review 只属于其中一种 kind(代码:`kind: "file_selection" | "git_diff"`)。kind 改变**整个工作区的框架**——navigator 内容、editor 默认渲染、评论锚、跨 round 对比能力、resnapshot 语义。下表的状态多数是 **kind 无关**(两种都出现),少数是 **kind 专属**(只在某一种出现,见 J 组)。

| 维度 | **file_selection** | **git_diff** |
|------|--------------------|--------------|
| 含义 | 审一组文件的**当前状态** | 审一个 **diff**(base...head) |
| 面包屑 | `suikou › review名` | `suikou › head@sha..base@sha`(`DiffRefsLine`) + **Diff** badge(GitCompare) |
| navigator | 文件 + A/M/D change-status;**可 soft-remove / reselect** | diff 内文件 + 每文件 **+N/−M** 统计;集合由 diff 定,**不能 soft-remove** |
| editor 默认渲染 | 文件内容(source / preview / html / image / binary) | **diff(unified / side-by-side)= 原生视图**(view-kind `diff`) |
| 评论锚 | line_range / element | **diff_hunk(old / new 侧)** |
| 跨 round 对比 | 只能列"变了啥"(无旧文本快照,只存 content_hash) | **真·逐行 text diff**(diff artifact 自带 diff,可重建) |
| resnapshot | 按 content_hash 重读盘 | **重新 diff refs**;`refs_moved` → 琥珀 "refs moved";base/head 分支没了 → 红 "branch deleted" |

> 现有 storyboard(A–I 各组的 mockup)默认演示的是 **file_selection**;**git_diff 专属态见 J 组**。D6/D7(diff unified / side-by-side)在 file_selection 里只对"被删文件"等个别 artifact 出现,在 git_diff 里是**每个文件的原生视图**。

---

## A. 工作区 / review 级状态

| # | 状态 | 何时 | 关键呈现 | 状态 |
|---|------|------|----------|------|
| A1 | **空 review** | review 内没有文件 | "选文件开始" 空态 | ✅ |
| A1b | **打开默认选中第一个文件** | review 有文件、刚进入 | 不留空 editor,自动选 navigator 第一个文件并渲染 | ✅ |
| A2 | **首轮 round 0(draft)** | 刚建、还没提交 | round 选择器显 Round 0/draft;无 published critique | ✅ |
| A3 | **审阅中(有 pending)** | 留了未发 comment / 草稿 verdict | 状态条 "N pending";submit 可用 | ✅ |
| A4 | **已提交一轮(under review)** | submit 后 | round 标 "under review";comment 已 published | ✅ |
| A5 | **多轮:看最新 round** | 默认 | round 选择器=latest | ✅ |
| A6 | **多轮:看历史 round(superseded)** | 切到旧轮 | 只读,标 "superseded";不能在旧轮 author | ✅ |
| A7 | **round 对比** | 点 ⇄ Compare | critique 变化(resolved/新增/open)+ verdict 变化 | ✅ |
| A8 | **review 全部 approved** | 末轮 approve | 头部/状态条标 approved(可逆) | ➕ |
| A9 | **request_changes 态** | 末轮 request_changes | 状态条标 changes requested | ✅ |
| A10 | **resnapshot 后** | 拉了 agent 改动入 draft | 文件内容更新、outdated 重算提示 | ➕ |

## B. 连接 / 系统态

| # | 状态 | 何时 | 关键呈现 | 状态 |
|---|------|------|----------|------|
| B1 | **connected** | 正常 | 连接点静默 | ✅ |
| B2 | **reconnecting** | socket flap >600ms | 状态条右侧琥珀 "reconnecting" LED + 文字 | ✅ |
| B3 | **加载中** | 文件内容/高亮未到 | 占位(<200ms 不显 skeleton) | ✅ |

## C. Navigator(文件列表)状态

| # | 状态 | 何时 | 关键呈现 | 状态 |
|---|------|------|----------|------|
| C1 | **文件 change status** | 总是 | A 增 / M 改 / D 删 各 glyph | ✅ |
| C2 | **已审 ✓** | 该文件定了 verdict | 行尾 ✓ | ✅ |
| C3 | **未读 / blocker ●** | 有新变化 / 未解决 fix_required | 行首 ● | ✅ |
| C4 | **comment 数 badge** | 有 comment | 数字 badge(fix 色重) | ✅ |
| C5 | **选中文件** | 当前查看 | 高亮行 | ✅ |
| C6 | **树状 vs 平铺** | display 选项 | 目录层级折叠 / 平铺 | ◐(craft 树) |
| C7 | **过滤框 有结果/空** | 输入过滤 | **只按文件名**过滤(不搜内容、不全局搜索);命中高亮 / "无匹配" | ✅ |
| C8 | **soft-removed 文件** | 移出 file-selection | 灰显/可 reselect | ➕ |
| C9 | **navigator 折叠** | 收起左栏 | editor 全宽 | ➕ |

## D. Editor 渲染态(每种文件类型)

| # | 状态 | 关键呈现 | 状态 |
|---|------|----------|------|
| D1 | **source**(代码/文本) | Shiki 高亮 + 行 gutter + wrap | ✅ |
| D2 | **preview·markdown** | 逐块渲染 + density + flavor + Source 切换 | ✅ |
| D3 | **html · Comment 模式** | iframe + 元素 hover 虚线 + dot 评论 | ✅ |
| D4 | **html · Interactive 模式** | 页面可交互,评论锚关闭 | ➕ |
| D5 | **html · zoom / fullscreen** | 缩放 **10%–200%**(最低 0.1×)/ 全屏 | ✅ |
| D6 | **diff · unified** | 单列 +/− + 双行号 | ✅ |
| D7 | **diff · side-by-side** | 双列 old/new | ✅ |
| D8 | **image** | 居中 img,无 zoom,仅 artifact 评论 | ✅ |
| D9 | **binary** | "Can't render" notice | ✅ |
| D10 | **wrap on/off**(source) | 长行换行/截断 | ✅ |
| D11 | **空文件 / 全文件堆叠模式** | stacked 滚动看全部 | ➕ |

## E. Comment 生命周期态

| # | 状态 | 关键呈现 | 状态 |
|---|------|----------|------|
| E1 | **三 type** | fix_required(红)/ needs_answer(琥珀)/ note(中性) | ✅ |
| E2 | **两 scope** | artifact(文件级)/ located(行/元素) | ✅ |
| E3 | **pending(未发)** | 可编辑/删,标 pending | ✅ |
| E4 | **published(已发)** | 冻结正文/type/anchor | ✅ |
| E5 | **open(未解决)** | 默认展开 | ✅ |
| E6 | **resolved** | 折叠 + resolved_round 标记 | ✅ |
| E7 | **outdated** | 琥珀条 + 原 quote + Re-anchor | ✅ |
| E8 | **drifted** | 重锚到相似行提示 | ➕ |
| E9 | **带 agent 回复** | ↳ agent(自定义名) | ✅ |
| E10 | **带 human 回复(pending)** | 提交才发 | ➕ |
| E11 | **human 回 resolved → 自动重开** | resolved 被回复后重新 open | ➕ |
| E12 | **reactions 已应用 + picker** | 👍✅👀🎉❤️🙏 + 计数 | ✅ |
| E13 | **inline 呈现** | editor 行间 | ✅ |
| E14 | **side(inspector)呈现** | 右侧 Notion 式截断 + focus 展开 | ✅ |
| E15 | **html element:dot 折叠 / popover 展开** | 角标 dot → 就地展开 | ✅ |
| E16 | **stranded(无锚/超文件)** | 落顶部 | ➕ |

## F. Composer(创建/回复/编辑)态

| # | 状态 | 关键呈现 | 状态 |
|---|------|----------|------|
| F1 | **行 composer(新建)** | gutter 点 → type pill + textarea + Suggest + Add | ✅ |
| F2 | **范围选择(shift)** | 多行高亮 | ✅ |
| F3 | **html element composer** | quote 摘录 + type + textarea | ✅ |
| F4 | **回复 composer** | thread 内回复框 | ✅ |
| F5 | **编辑 pending comment** | 改正文/type | ✅ |
| F6 | **草稿恢复** | 重开带回草稿文字 | ➕ |
| F7 | **Suggest(代码建议块)** | 围栏建议 | ✅ |

## G. Verdict / Submit 态

| # | 状态 | 关键呈现 | 状态 |
|---|------|----------|------|
| G1 | **每文件 verdict chip** | none / approve / request_changes / comment | ✅ |
| G2 | **文件 note(artifact 级)** | verdict chip 内可填 note | ➕ |
| G3 | **submit 面板** | Comment/Approve/Request changes 单选 + pending 计数 | ✅ |
| G4 | **soft gate 警告** | approve 但有 open fix_required → ⚠ 不阻断 | ✅ |
| G5 | **submit 确认对话框** | 说明将发布啥 | ✅ |
| G6 | **dismiss approval** | 撤销 approve 重开 | ➕ |
| G7 | **copy 菜单** | 提交组右侧下拉:copy noteworthy / copy all(输出即 markdown) | ✅ |
| G8 | **未解决 blocker 指示** | 文件/review 有 open fix_required | ✅ |

## H. Inspector 三态

| # | 状态 | 关键呈现 | 状态 |
|---|------|----------|------|
| H1 | **选中 comment → 完整 thread** | type/anchor/正文/全 reply/回复框/Resolve/re-anchor/react | ✅ |
| H2 | **没选 → review 概览** | verdict 汇总 / blockers / round 统计 | ✅ |
| H3 | **submit 面板**(c 态) | 见 G3 | ✅ |
| H4 | **inspector 折叠** | 收起右栏 | ➕ |

## I. display 子模式(可组合)

- 文件范围:单文件(默认)/ 全文件堆叠
- comment 布局:inline(默认)/ side(右 float)/ 隐藏
- diff 布局:unified / side-by-side
- round:单 round / 对比
- 主题 / 密度 / wrap / flavor

---

## J. git_diff review 专属态(file_selection 没有)

| # | 状态 | 何时 | 关键呈现 | 状态 |
|---|------|------|----------|------|
> 下表编号 = `states-codex.html` 里的实际页编号。

| # | 状态 | 何时 | 关键呈现 | 状态 |
|---|------|------|----------|------|
| J1 | **diff 概览 + navigator 统计 + 首文件** | 进入 git_diff review | 面包屑 refs `base@sha..head@sha` + Diff badge;navigator 每文件 `+N/−M`、总计 +79 −27、**无 soft-remove**;editor = **原生 unified diff**;diff_hunk 评论(new 侧) | ✅ |
| J2 | **diff_hunk 评论 · side-by-side(old 侧)** | 双列 + 评论 | old/new 双列,评论锚到 old(deleted)侧 | ✅ |
| J3 | **diff hunk 范围选 composer** | shift 选 hunk 多行 | 同侧多行高亮(`.dline.insel`)+ composer | ✅ |
| J4 | **refs moved → 重新 diff** | base/head 移动 | 琥珀 `refs moved` 徽章 + "Re-diff refs" 横幅(git_diff 版 resnapshot) | ✅ |
| J5 | **跨 round 真·逐行 diff** | round 对比(git_diff) | R1→R2 **实际改动 diff**(file review 给不出);critique + verdict 变化 | ✅ |
| J6 | **diff submit / per-file verdict** | submit | diff 文件的 verdict chip + submit 面板(soft gate) | ✅ |
| J7 | **branch deleted(vanished)** | base/head 分支被删 | 红 `branch deleted` 徽章 + 横幅;只读冻结 | ✅ |
| J8 | **diff 评论 resolved + agent 回复** | round 推进后 | diff_hunk thread resolved、agent reply(Applied 注记) | ✅ |

## 本轮已建页清单(✅ 已补齐 — 见 `states-codex.html`,共 48 页)

**git_diff 块(8 页):** J1 概览 + 原生 unified diff + diff_hunk 评论(new 侧) · J2 side-by-side + 评论(old 侧) · J3 hunk 范围选 composer · J4 refs moved → re-diff 横幅 · J5 跨 round 真·逐行 diff(R1→R2) · J6 diff submit + per-file verdict · J7 branch deleted(vanished,只读冻结) · J8 diff 评论 resolved + agent 回复。

**file 侧补齐(11 页):** E2 artifact-scope 评论 · G2 file note · G7 copy 菜单(noteworthy / all / markdown) · F5 编辑 pending comment · E16 stranded(无锚落顶部 + 手动重锚) · E8 drifted(重锚相似行 14→17) · E12 reactions 已应用 + picker · D5 html zoom 60% / fullscreen · D10 wrap on/off · F3 html element composer(CSS selector + quote 摘录) · F7 Suggest 代码建议块。

## 优先补的状态(➕ 里最影响理解的)

作为 reviewer,这些状态最常遇到、但 mockup 还缺,建议优先做:
1. **A6 看历史 round(只读 superseded)** + **A2 round 0 draft**
2. **E6 resolved comment** + **E3 pending vs E4 published** 的视觉区分
3. **H2 inspector review 概览**(没选 comment 时)
4. **A8 approved / A9 request_changes** 的 review 级标识
5. **C8 soft-removed / C9 navigator 折叠** + **H4 inspector 折叠**
6. **G6 dismiss approval / G7 copy 菜单 / G5 submit 确认**
7. **B2 reconnecting / B3 加载**
8. **D4 html Interactive 模式 / D11 全文件堆叠**

## 待你定
- 状态可视化 variants 用**哪个方向**做(macos / craft / raycast / 三个都做)?
- 是做成一个"**状态画廊**"页(所有状态平铺对比),还是补进各自的 review 变体里?
