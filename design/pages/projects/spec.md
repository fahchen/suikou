# Projects 页(首页)

> 总览见 `../../pages.md`。本页 = app 启动器 + 项目/review 管理。web app,路由导航。
> 本文件夹 `pages/projects/` 含本页 spec 与各设计方向的 HTML 变体(macos / raycast / craft)。

**用途:** 项目和 review 的启动器 + 管理器。app 打开默认落这页;记住上次 review,可一键回 / ⌘K 回。

## 布局(ASCII 线框)

两栏:左 = 项目列表(sidebar),右 = 选中项目的 review 列表;顶 = 工具栏。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Suikou                                      ⌘K search…       + New ▾    ⚙  │  ← toolbar
├────────────────────┬───────────────────────────────────────────────────────┤
│ PROJECTS           │  suikou                            /Users/me/suikou  ⋯ │  ← 项目 header(name·path·操作⋯)
│                    │ ─────────────────────────────────────────────────────  │
│ ▸ suikou         ● │  ┌─────────────────────────────────────────────────┐  │
│   yoiyo            │  │  + New review                        files ▾ / diff│  │  ← 新建 review(两类)
│   docs             │  └─────────────────────────────────────────────────┘  │
│                    │                                                        │
│ + Add project      │  ● Redesign spec          5 files · files · 2h     ›  │  ← review 行
│                    │    Auth refactor          9 files · diff  · 1d     ›  │
│                    │    Landing copy           3 files · files · 3d     ›  │
│                    │  ✓ API cleanup            6 files · diff  · 1w     ›  │  ← ✓ = approved
│                    │                                                        │
└────────────────────┴───────────────────────────────────────────────────────┘
   └ 项目列表(sidebar)     └ review 列表(选中项目的 reviews)
```

**图例 / 功能标记**
- `🔭`(行首 emoji)= review 可选 **emoji icon**(用户给 review 设的图标;无则用默认小图标)。
- `●`(行首点)= **未读/变化**:上次看后 agent 改了文件 / 回了 comment;进过该 review 即清。
- `✓` = 该 review 已 **approved**。
- `kind`:`files`(file-selection)/ `diff`(git-diff)。
- `⋯` = **项目操作**(编辑设置 gitignore / 删除)。
- `›` = 打开 review。
- `⌘K` = command palette(跨页跳转);`⚙` = Settings(⌘,);`+ New ▾` = 新建项目 / 新建 review。

### 新建 review 菜单(点 `+ New review`)
```
┌──────────────────────────┐
│ New review               │
│ ──────────────────────── │
│ ◎ Select files…          │  → 文件/目录多选(目录懒展开)
│ ◎ From git diff…         │  → branch picker(下)
└──────────────────────────┘
```

### git-diff branch picker
```
┌────────────────────────────────────────────┐
│ New diff review                            │
│  Base  [ main                 ▾ ]          │  ← 本地分支 + remote-tracking + 默认分支
│  Head  [ feat/redesign        ▾ ]          │     按提交日期倒序
│ ────────────────────────────────────────── │
│  merge-base 语义;ref 创建后固定             │
│  6 changed files                           │
│                          Cancel    Create  │
└────────────────────────────────────────────┘
```

### 空 / 首次状态
```
无项目:                              项目无 review:
┌────────────────────┐              ┌──────────────────────────┐
│        ▢           │              │          ▢               │
│   还没有项目         │              │    选文件开一个 review     │
│   [ 添加项目 ]      │              │    [ + New review ]      │
└────────────────────┘              └──────────────────────────┘
```
终态简洁:图标 + 一行 + 一个主操作。

## 区域(明细)

| 区域 | 放什么 | 功能 / 控件 | 状态 |
|------|--------|-------------|------|
| **项目列表**(左) | 所有已注册项目 | 选项目;加项目;每个项目:编辑设置(gitignore)、删除(⋯) | 空 → "还没有项目,添加一个开始" |
| **review 列表**(右) | 选中项目下的 review | 打开 review;新建 review(file-selection / git-diff);每个 review:重命名、改文件集、删除;**未读/变化标记 ●** | 空 → "选文件开一个 review";加载中 |
| **review 行** | 单个 review 摘要 | 可选 **emoji icon**(行首)、文件数、kind(files/diff)、HTML badge、时间、**●未读 / ✓approved**;点击 → 打开 | — |
| **项目 header**(右上) | 选中项目信息 | name · path · 项目操作(⋯) | — |
| **toolbar**(顶) | 全局 | ⌘K、+ New(项目/review)、设置 ⚙(⌘,) | — |

## 流程
- **建项目:** 名字 + 路径 → 进项目列表(name/path 创建后不可改)。
- **打开 review:** 点行 → Review 页。
- **删除类:** 删项目/review → modal/dialog 确认(web app,无原生确认);软删,保留 critique 历史。

## 未读 / 变化标记
- review 行标 `●`:**上次看后 agent 改了文件 / 回了 comment**(轻量,不做完整通知中心)。
- 进过 review 即清该标记。

## 约定
- **emoji icon:** 每个 review 可设可选 emoji 作为图标(行首显示);未设则默认小图标。
- **无 user / avatar:** 单人工具,UI 不出现用户头像 / 用户名概念。
- **密度:** 偏 compact(信息密度优先,别太松)。

## 待深化(后续)
- review 列表排序/分组(按时间?按状态 open/approved?)。
- review 行要不要显示 verdict 概览(approve/changes 计数)。
- 项目"编辑设置"浮层的字段布局。
