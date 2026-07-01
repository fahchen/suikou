# Suikou — 页面与功能布局(总览 / index)

> **Suikou 是 web app**(Phoenix + React),视觉上做成 macOS Tahoe 风格,但底层是网页:页面间靠**路由导航**,没有原生窗口、原生对话框、原生菜单的概念。本文是总览;视觉/样式见 `redesign.md`。

术语沿用代码里的英文(comment / verdict / round / inspector / navigator / diff / anchor / inline 等),不翻译。

## 文档结构
- **本文件** `pages.md` —— 总览:页面清单、导航图、决策记录、功能覆盖矩阵、刻意不做。
- `pages/projects/` —— **Projects** 首页(`spec.md` + 各方向 HTML 变体 macos/raycast/craft)。
- `pages/review/` —— **Review** workspace(核心,`spec.md` + 各方向 HTML 变体 macos/raycast/craft)。
- `pages/settings.md` —— **Settings**(modal/dialog 浮层)。

---

## A. 页面清单

| # | 页面 | 用途 | 用户主要动作 | 详见 |
|---|------|------|--------------|------|
| 1 | **Projects**(首页) | 选项目、选 review、打开它;管理两者。 | 浏览 / 新建 / 打开 | `pages/projects/spec.md` |
| 2 | **Review** | 工作区:读文件、留 comment、定 verdict、submit、跨 round 迭代。 | 审代码 | `pages/review/spec.md` |
| 3 | **Settings** | app + 项目偏好。modal/dialog 浮层,不是独立页。 | 配置 | `pages/settings.md` |

其余(composer、submit、确认对话框、command palette、round 对比)都是某一页**内部的 surface**,不算独立页。

全局 **command palette(⌘K)** 跨页存在:快速跳转到项目 / review / 文件 / 动作,也用来在 Projects 与各 review 之间快速切换。

---

## B. 导航图

```
                ┌──────────────┐
        ┌──────▶│   Projects   │◀──────┐
        │       └──────┬───────┘       │
        │      打开一个 review          │ 返回 / ⌘K
        │              ▼               │
        │       ┌──────────────┐       │
   ⌘K   │       │    Review    │───────┘
  任意页 │       │  workspace   │
        ▼       └──────┬───────┘
 ┌──────────┐          │ 内部:换文件 / 换 round / round 对比 / 换模式
 │ Settings │          │       选 comment → thread / submit → 封 round
 │ (modal)  │          ▼
 └──────────┘   (停在 workspace,换文件走路由但不离开壳)
```

- Projects ⇄ Review 是用户唯一频繁的页对页跳转;⌘K 可从任意页跳到任意 review/项目。
- Review **内部**:换文件、换 round、round 对比、选 comment,都在 workspace 壳内完成(换文件底层走路由 `/reviews/$id/files/$path`,但视觉上不离开工作区)。
- Settings 是 modal/dialog 浮层(从任意页 ⌘, 打开),关闭后停在原处。
- **deep link:** 每个 review / 文件(可到行)有可分享 URL;agent CLI 也能取 review 的浏览器 URL。

---

## C. 决策记录(讨论过程)

把怎么走到现在记下来:每条 = 议题 → 考虑过什么 → 最终怎么定 + 为何。各页正文已按这些结论写。

1. **平台定性。** 起初按"原生 macOS app"设计(NSVisualEffectView、document-per-window)。澄清后:**Suikou 是 web app**——页面间路由导航,没有原生窗口/对话框;视觉上仿 macOS Tahoe(CSS),结构是网页。连带:确认/Settings 用 **modal/dialog**,不是原生。
2. **首页命名与形态。** Library vs 常驻 sidebar。问题:review 里左栏已是文件 navigator,首页再常驻就成双 sidebar。定:**独立"打开"页**,改名 **Projects**;进 review 后左栏即文件列表;toolbar 留返回 + review 切换 popup;**⌘K** 跨页快速切。
3. **comment 布局。** inline(读 diff 好)vs side(读长 thread 好)。定:**inline 默认**;side 用 **Notion 式**——右侧 float、与行对齐,只显 comment + 最新 reply、最多 3 行,focus 展开全部;长讨论选中进 inspector。
4. **renderer 模型。** 原先 rendered/html/image/video/binary 平铺。定:两模式 **source / preview**,**preview 按文件类型变**(markdown/html/image/video);**diff** 单列(git-diff 专用),且支持**展开更多/全部展开**(GitHub 式)。
5. **comment scope。** 原列三 scope(review/artifact/located)。定:**去掉 review 级 comment**,只 **artifact + located**。
6. **round 对比。** 原想"两 round 快照 text diff"。澄清:**file review 不存快照**(只 content_hash + 实时读盘)。定:round 对比主看 **critique + verdict 变化**;逐行 text diff 仅 git-diff artifact 可给。(待定:是否为 file review 单独存历史内容以支持逐行 diff。)
7. **re-anchor 策略。** 定:**放宽上下匹配范围**(改动位移可能大);**多 comment 批量重锚累计 offset**(前一个移 n 行,后一个计入再扩/调范围)。
8. **round 推进与 verdict。** 定:submit **review-wide publish**(发全 review pending,sibling 留各自 round);**approval 可逆 + soft gate + 被更晚 round 取代**;草稿 verdict/body 持久化。
9. **导航与协作面。** 搜索:**不做**(只 ⌘K + navigator 过滤跳 file)。键盘导航基础集:**做**。未读/变化:**做,标在 review 列表**。reactions(单行 comment / reply):**做**;mentions / 多 reviewer:**不做**。不分二期,直接最终版。
10. **agent 回复。** 定:agent 回复**可带自定义显示名**。

---

## D. 功能覆盖矩阵

确保每个能力都落到某页/区,便于核对没漏。

| 功能 | 落点 |
|------|------|
| file-selection / git-diff 两类 review | projects · 新建 review |
| git-diff branch picker(base/head,merge-base,ref 固定) | projects · 新建 review |
| soft-remove / reselect 文件 | review · navigator |
| resnapshot 拉 agent 改动入 draft round | review · toolbar |
| source / preview(markdown/html/image/video)+ diff(可展开) | review · 渲染 |
| 三 verdict + approval 可逆 + soft gate + 被更晚 round 取代 | review · verdict 与 submit |
| review-wide publish | review · verdict 与 submit |
| 草稿 verdict / 草稿 body 持久化 | review · verdict;composer |
| comment 单行跨 round(authored/resolved_round 派生) | review · 不变量 |
| 只最新 round author;published 冻结 | review · 生命周期 |
| outdated 实时派生 + 手动 re-anchor(放宽范围 + 累计 offset) | review · 生命周期 |
| human 回 resolved 自动重开;agent 只能回 open;agent 回复自定义名 | review · 生命周期 |
| reaction(单行 comment / reply) | review · 生命周期 |
| 两 scope(artifact/located)/ 三 type / 三 anchor | review · 不变量 |
| round 对比(critique + verdict 变化;file review 不存快照) | review · round 对比 |
| project respect_gitignore;name/path 不可改 | projects / settings |
| deep link 到 review/文件/行 | 本文 B / review |
| ⌘K command palette;键盘导航基础集 | 跨页 / review · 交互细节 |
| 未读/变化标记 | projects · review 列表 |
| 空/首次状态 | projects / review · 空状态 |

---

## E. 刻意不做 / 不放这里
- 视觉样式、材质、Liquid Glass、强调色、字体 —— 见 `redesign.md`(其原生框架待按 web app 重新对齐)。
- 组件/代码结构 —— 等页面 + 视觉定了再说。
- 导出/agent CLI 细节 —— 那是 agent 面,不是 UI 页面。
- 全局搜索、mentions、多 reviewer —— 明确不做。
