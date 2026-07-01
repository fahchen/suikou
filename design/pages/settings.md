# Settings(modal/dialog 浮层)

> 总览见 `../pages.md`。Settings 不是独立页,是从任意页 **⌘,** 打开的 modal/dialog 浮层(web app,无原生偏好窗口),关闭后停在原处。

**用途:** app 偏好 + 项目偏好。分两组:全局 app 偏好、当前项目设置。

## 分组

### 1. 项目设置(当前项目)
| 设置 | 说明 |
|------|------|
| **respect_gitignore** | 列候选文件时是否按 `.gitignore` 过滤(`.git` 永远排除)。可切换。 |
| **name / path** | 创建后**不可改**(文件锚在 path 上,不能移),只读展示。 |
| **删除项目** | modal 确认;软删,保留 critique 历史。 |

### 2. app 偏好(全局)
| 设置 | 说明 |
|------|------|
| **外观 / 主题** | 跟随系统 / 浅 / 深(具体配色见 `redesign.md`)。 |
| **默认文件范围** | 单文件 / 全文件堆叠。 |
| **默认 comment 布局** | inline / side / 隐藏。 |
| **默认 diff 布局** | unified / side-by-side。 |
| **markdown flavor 默认** | GFM / CommonMark。 |
| **密度 / wrap 默认** | 渲染密度、source 换行默认。 |

> 这些"默认"是新开 review 的起点;单个 review 里仍可用 toolbar display 菜单临时改(per-review 持久化)。

## 形态
- modal/dialog 浮层,**不是路由页**(不改 URL,关闭回原处)。
- 列表式分组(项目设置 / app 偏好),改即存(web,无"保存"按钮)。
- ⌘, 打开,Esc / 点遮罩关闭。

## 待深化(后续)
- 项目设置 vs app 偏好是否分两个 tab,还是单列分组。
- 主题选项是否暴露(若 redesign 决定全浅色,这里就收掉深色)。
