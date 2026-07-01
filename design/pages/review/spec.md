# Review 页(workspace,核心)

> 总览见 `../../pages.md`。本页是 app 的核心,95% 时间在这。web app,路由导航;换文件走路由但视觉不离开工作区。
> 本文件夹 `pages/review/` 含本页 spec 与各设计方向的 HTML 变体(macos / raycast / craft)。

**用途:** 逐文件读、留 anchored comment、定每文件 verdict、批量 submit、跨 round 迭代、看 round 间变化。参照 GitHub "Files changed",重组成工作区。

## 布局(ASCII 线框)

三栏工作区:左 navigator(文件)· 中 editor(内容 + inline comment)· 右 inspector(选中 thread / verdict / submit);顶 toolbar,底 状态条。

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Projects   docs · Spec review     Round 2 ▾  ⇄ Compare      ⚙ Display     ⤴ Submit ▾│ ← toolbar
├────────────────────┬───────────────────────────────────────────────┬─────────────────┤
│ FILES   4/6 ✓      │  🔭 spec.md              [ Source | Preview ]  ⊘│ INSPECTOR       │
│ ⌕ filter files     │ ──────────────────────────────────────────────  │ ▲ fix_required ▾│
│                    │  12 │ def handle(conn, params) do              │ on line 13 · R2 │
│ ◍ M ● spec.md   ② │  13 │   user = Repo.get(User, id)              │ ┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ✓ A   parser.ex    │ ┌── ▲ fix · you · line 13 ───────────────┐   │ Guard nil before│
│ ● M   router.ex ① │ │ Guard against nil before Repo.get.       │   │ Repo.get.       │
│ ✓ M   schema.ex    │ │ ↳ agent: added fetch_user/1 {:ok,…}      │   │ ↳ agent · R3    │
│ ◍ D   legacy.ex    │ │ [ Reply…                            ⏎ ]  │   │   added fetch…  │
│ ◍ A   index.html ③│ └──────────────────────────────────────────┘   │ [Reply…] [react]│
│                    │  14 │   render(conn, user)                     │ [✓ Resolve]     │
├────────────────────┴───────────────────────────────────────────────┴─────────────────┤
│ 4 of 6 reviewed · 3 unresolved                                          ◐ connected     │ ← 状态条
└────────────────────────────────────────────────────────────────────────────────────┘
   └ navigator(文件)       └ editor(内容 + inline thread)        └ inspector(选中 thread)
```

**图例**
- 文件行:`change status`(◍M 改 / ✓A 增 / ◍D 删)· `●` 未读或未解决 blocker · 文件名 · `②` comment 数 · 行尾 `✓` 已审。
- 文件头:`🔭` review/文件 emoji · 路径 · `Source|Preview` 切换 · `⊘` 该文件 verdict chip。
- inline thread:夹在行间,锚到 `start_line`;含 type、作者、anchor、正文、agent 回复、回复框。

### inline 加 comment(行 gutter 点出 composer)
```
 13 │   user = Repo.get(User, id)
   ┌─ comment on line 13 ───────────────┐
   │ ▲ fix_required   ? needs   • note  │  ← type pill
   │ [ Write a comment…              ]  │  ← markdown textarea
   │ [ Suggest ]          Cancel   Add ⏎│  ← ⌘⏎ 提交;Suggest=代码块
   └────────────────────────────────────┘
 14 │   render(conn, user)
```

### inspector 选中 thread(side 也用 Notion 式截断)
```
┌─ INSPECTOR ───────────────┐
│ ▲ fix_required ▾          │  ← type 可改(pending)
│ on line 13 · Round 2      │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ Guard against nil…        │  ← 正文(side 截 3 行,focus 展开)
│ ↳ agent · R3              │
│   added fetch_user/1      │  ← 只显最新一条 reply
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ [ Reply…              ⏎ ] │
│ [✓ Resolve]  😀 react     │
└───────────────────────────┘
```

### submit 面板(toolbar Submit ▾ 弹出 / 或 inspector)
```
┌─ Finish review ────────────┐
│ ○ Comment                  │  ← review verdict 单选
│ ○ Approve                  │
│ ◉ Request changes          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ 3 pending comments         │  ← 将一次发布(全 review)
│ 2 draft verdicts           │
│ ⚠ 1 open fix_required      │  ← soft gate:警告不阻断
│ [ Submit review ]          │
│ Copy noteworthy ▾          │
└────────────────────────────┘
```

### round 对比(toolbar ⇄ Compare)
```
┌─ Round 1 → Round 2 ─────────────────────────────────┐
│ ✓ 2 resolved   + 1 new   ○ 3 still open             │  ← critique 变化
│ verdict:  request_changes  →  (draft) approve       │  ← verdict 变化
│ git-diff artifact:逐行 text diff;file review:仅列变化│
└─────────────────────────────────────────────────────┘
```

### outdated / re-anchor
```
 ┌─ ▲ fix · line 13(outdated)──────────────┐
 │ ⚠ 引用的行变了,锚已失效                    │  ← 琥珀条
 │ 原 quote: "user = Repo.get(User, id)"     │
 │ [ Re-anchor to current line ]             │  ← 重锚(放宽范围 + 批量累计 offset)
 └───────────────────────────────────────────┘
```

---

## 区域

| 区域 | 放什么 | 功能 / 控件 |
|------|--------|-------------|
| **toolbar** | review 级控件 | 返回 Projects;项目·review 标题;**round 选择器**(+ "对比 round");**display 选项**(文件模式、comment 布局、过滤、主题、密度、wrap);**resnapshot**(拉 agent 改动入当前 draft round);**submit**(+ copy 菜单);inspector 开关;连接状态 |
| **navigator** | 文件清单 | 可**树状**(按目录层级缩进/折叠)或平铺;每文件:change status(A/M/D)、名字、comment 数 badge、已审 ✓、未解决 blocker 点;过滤框(**只按文件名**过滤,不搜内容/不全局搜索);type-ahead;跳"下一个有 comment 的文件";**soft-remove / reselect 文件**(file-selection);**打开 review 默认选中第一个文件**(非空时不留空 editor) |
| **editor** | 选中文件的内容 | 文件头(路径/TOC、source/preview 切换、每文件 **verdict** chip);内容渲染(见下);**inline comment thread**;行 gutter 加 comment;**re-anchor** outdated comment |
| **右栏(仅 side 模式)** | 评论 rail | 仅当 comment 布局 = side 时出现:评论与代码行对齐,comment + 最新 reply 各 ≤3 行、点击展开全部。**inline 模式无右栏**(navigator + editor 两栏)。review 概览 / submit 不在此栏,走 **toolbar 弹层** |
| **状态条** | 进度 | "N of M reviewed"、未解决数、连接状态 |

## 内容渲染(对齐现状代码)

> 代码里 view kind = **file / diff / html**(`view-kind.ts`)。file 内:markdown 有 rendered↔source 切换(代码字段 `DocView: "rendered" | "source"`;UI 标签沿用我们定的 **Source | Preview**),图片走 ImageView,其它文本走 source。每种文件类型的视图不同——下面按代码实际行为列。

| 模式 / 类型 | 行为(按代码) | comment 锚 |
|------|------|------|
| **source**(代码/文本) | Shiki 语法高亮、行 gutter、wrap 开关 | **line_range**(gutter 点;shift 选范围) |
| **preview · markdown**(.md) | 逐块渲染(标题/段/列表/blockquote/code fence/table,每块独立可锚)、density(tight/normal/loose)、flavor(GFM/CommonMark);可切 Source | **line_range**(逐块/逐行;表格逐行;code fence 逐行) |
| **html**(.html/.htm) | sandboxed iframe;**Comment ↔ Interactive** 切换;**zoom 10%–200%**(0.1–2×,step 0.1;代码当前最低 0.5×,设计要到 10%);fullscreen;也可看 Source | **element**:CSS `:nth-of-type` selector + quote(≤200 字);hover 虚线轮廓;**评论以元素右上角小 dot 表示,点击就地展开 thread**(不用大块 inline);**仅客户端**判 outdated/重锚 |
| **diff**(git-diff artifact) | **unified / side-by-side**(窄屏强制 unified);双侧 gutter、Shiki 高亮 | **diff_hunk**(old/new 侧;shift 选范围) |
| **image**(png/jpg/svg/…) | `<img>` 居中,max-h 80vh(**当前无 zoom**) | **仅 artifact 级**(图片无 located) |
| **binary** | "Can't render this file" notice | **无 comment** |

located comment:source / markdown 走 line_range,html 走 element;image 仅 artifact 级;binary 无 comment。stranded(无锚/超出文件)comment 落在顶部。

> **与现状代码的差异(待你拍,决定是否纳入设计):**
> - **video:** 代码**未实现**(视频文件落 binary placeholder)。要不要作为计划内的 preview·video 模式?
> - **diff 展开上下文(GitHub 式 expand 5 行 / 全展开):** 代码**未实现**(hunk 全量渲染)。要不要加?
> - **image zoom:** 代码当前**没有**;要不要补?
> - 命名:代码内部叫 `rendered`,我们 UI 标签用 "Preview"(仅标签差异)。

### reactions(新功能,代码暂无)
代码现状**没有 reaction**;这是我们新加的设计。建议一组固定 emoji,点开 picker 选:👍 ✅ 👀 🎉 ❤️ 🙏。挂在**单行 comment** 或**某条 reply** 上,快速跟 agent 交流(非 mentions)。

## comment 生命周期(每步落在哪)

| 步骤 | surface | 备注 |
|------|---------|------|
| 创建 | anchor 处 composer(gutter 行 / html element)或 inspector | type pill(fix_required / needs_answer / note);markdown;Suggest/Quote;草稿持久化;**只能挂最新 round** |
| 显示 | editor inline,或 side 模式右侧 float | inline=行间;**side=Notion 式**:只显示 comment + 最新一条 reply,正文**最多 3 行截断**,focus/选中后展开全部 |
| anchor 状态 | inline 条 + inspector | outdated(quote 在当前快照定不到)/ drifted(重锚到相似行)→ 琥珀色,显示原始 quote |
| **re-anchor** | inline 条 / inspector | outdated comment 挪到新行,server 重抓 quote。**匹配范围放宽**(改动可能位移很多);**多 comment 批量重锚累计 offset**——前一个重锚后位移 n 行,后一个把该 offset 计入,据此扩大/修正自己的匹配范围 |
| **reaction** | inline 条 / inspector | 对**单行 comment 或某条 reply** 加 reaction,快速跟 agent 交流(轻量,非 mentions) |
| 回复 | inspector thread | **agent 回复**(立即 published,**可带自定义显示名**);human 回复(pending,提交才发);human 回 resolved → 自动重开 |
| resolve | inspector / card | 标 resolved(记 resolved_round);pending 不能 resolve;已 resolved 不能再 resolve |
| 过滤 | toolbar display 菜单 | status(all/unresolved/resolved)、type、hide-all、collapse-all |

### comment 布局:inline vs side(两种**互斥**显示;右栏只在 side 模式存在)
- **inline**:**navigator + editor 两栏,没有右栏**。comment thread 显示在 **editor 代码行间**(就地展开完整 thread:正文 + 全部 reply + 回复框 + 操作)。editor 占满右侧空间。
- **side**:多出**第三列 = 评论 rail**(navigator + editor + rail)。comment 显示在 rail 里,**与左侧对应代码行垂直对齐**(Notion 式)。默认**只显 comment + 最新一条 reply**,两者**各最多 3 行**,超出隐藏;**点击 focus → 展开全部 replies + 被隐藏的文本**。side 模式下**代码处不再 inline 显示该评论**(行上只留 marker 点)。
  - **评论太多时(密集)**:卡片进一步折叠成**只显一行**(单行摘要,省去 reply),点击再展开;让拥挤的 rail 仍可扫读。
- 关键:**同一条评论不会两处都显示**;右栏只是 side 模式的评论 rail,**不是常驻 inspector**。
- **review 概览(verdict 汇总 / open blockers / 本 round +N−M / 进度)和 submit 永远走 toolbar 弹层(popover)**,不占常驻栏;底部状态条常显 "N of M reviewed · unresolved"。

### comment 模型不变量(影响 UI 呈现)
- **单行跨多 round:** 一条 comment 是**一行**,凭 `authored_round` / `resolved_round` 派生在哪些 round 可见,**不复制**。UI 不要把"同一条在每轮的副本"画成多条。
- **published 不可改**(正文/type/scope/anchor 冻结),但可 resolve / 删 / 回复 / reaction。pending 可编辑/删。
- **scope 两种:** artifact(文件级)+ located(行/元素锚)。**不做 review 级 comment。**
- **三 anchor:** line_range、diff_hunk(old/new 侧)、element(HTML,CSS selector+quote,仅客户端重锚)。

## round 对比视图
- 主看 **critique 变化**(本轮 resolved / 新增 / 仍 open)+ **verdict 变化**(如 request_changes→approve)。
- **file review 不存历史快照**(只存 content_hash,内容实时读盘):跨 round **逐行 text diff** 仅 git-diff artifact 可给(自带 diff);file review 用 content_hash 判断这轮是否变过,内容已变则无法重建旧文本做逐行 diff。
- 入口:round 选择器旁的"对比"。用于"agent 这轮改/回了啥"。

## verdict 与 submit(批量、GitHub 式)
1. 每文件留 **pending** comment(批量,不实时发)。
2. 每文件定**草稿 verdict**(文件头 chip)+ 可选文件 note;**草稿 verdict reload 不丢**,submit 时清。
3. **submit** → 选 review verdict(approve / request_changes / comment)→ **一次发布整个 review 的所有 pending comment + reply**(不止当前文件);被提交文件进下一 draft round,**sibling 文件留在各自 round**。
4. **approval 模型:** approve 是终态但**可逆**——可 dismiss 重开;**只最新 round 可 approve**;之后提交更晚 round 会**自动清除** approval,迭代继续。request_changes / comment 不是终态。
5. **soft gate:** approve 时若仍有 open 的 fix_required → **警告但不阻断**(人有最终判断;verdict 与 critique type 正交)。
6. agent 处理 + 回复 →(人)resnapshot 拉新内容 → 人 submit → **新 round**;切 round / 进 round 对比看变化。
7. **copy:** copy noteworthy / copy all comments。

## display 子模式(本页的状态,不是独立页)
- **文件范围:** 单文件(默认)vs **全文件堆叠(all files)**。
  - **all files 模式:** navigator 仍在左;主区**竖向堆叠 review 的所有文件**,每个文件 = 文件头(路径 + change status + verdict chip + source/preview 切换)+ 内容(source/preview/diff)+ 评论,**依次排开、整页滚动**看完。点 navigator 文件 = 滚动到该文件。可 **hide reviewed**(收起已定 verdict 的文件);文件间用分隔。
  - **all files 同样支持 inline / side 两种 comment 模式**:inline = 评论在各文件内联;side = 整页右侧**一条评论 rail**,卡片对齐到其所属文件的对应行(跨堆叠文件统一一条 rail)。
- **comment 布局:** inline(默认)vs side(右侧 float,Notion 式截断)vs 隐藏。
- **diff 布局:** unified vs side-by-side。
- **round:** 看单个 round vs round 对比。

## 交互细节(已定)
- **键盘导航基础集:** j/k 上下、跳下一个 unresolved、g 跳文件,+ ⌘K command palette。
- **reactions:** 针对单行 comment 或某条 reply;**mentions / 多 reviewer 不做**。
- **无 user / avatar;** review 可带 emoji icon;密度偏 compact(沿用 Projects 约定)。

## 空状态
- review 无文件 → "选文件开始";round 无 comment → "这轮还没 comment";全文件已审 → "都审完了"。终态简洁:图标 + 一行。
