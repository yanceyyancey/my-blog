# Notion Content Model

这个项目当前以 Notion Database 作为 blog 的唯一内容源。

## 当前约定

- 数据库中的已发布文章：`Status = 完成`
- 日志流内容：`Category = Journal`
- 博客正文页面依赖 `Slug` 作为路由主键
- 站点列表、搜索、SEO 摘要都依赖摘要字段或正文回退生成

## 推荐字段

下面这组字段是后续维护时建议固定下来的最小 schema：

| 字段名 | 类型 | 必填 | 用途 |
| --- | --- | --- | --- |
| `Name` | Title | 是 | 文章标题 |
| `Slug` | Rich text | 是 | URL 路径，如 `my-first-post` |
| `Date` | Date | 是 | 发布时间，用于排序、归档、RSS |
| `Status` | Status | 是 | 发布状态，线上读取 `完成` |
| `Category` | Select | 是 | 分类；`Journal` 会进入日志流而不是主 blog 列表 |
| `Tags` | Multi-select | 否 | 标签页、搜索、筛选 |
| `Summary` | Rich text | 强烈建议 | 列表摘要、搜索摘要、文章 SEO 描述 |
| `Cover` | Files & media | 否 | 预留封面图字段，当前代码已支持读取 |

## 兼容策略

代码目前对少量历史字段做了兼容，避免你现有内容立即失效：

- 标题字段兼容：`Name`、`Title`
- 摘要字段兼容：`Summary`、`Description`、`Excerpt`、`SEO Description`、`Subtitle`
- 封面字段兼容：`Cover`、`Cover Image`、`CoverImage`

建议后续逐步收口到单一命名：

- 标题统一用 `Name`
- 摘要统一用 `Summary`
- 封面统一用 `Cover`

## 发布规则

- `Status != 完成` 的内容不会出现在线上
- `Category = Journal` 的内容不会进入 `/blog`
- 某篇文章如果没有 `Summary`，系统会从正文自动生成一个简短描述

## 写作建议

- `Slug` 使用英文小写加连字符，避免空格和中文
- `Summary` 控制在 1 到 2 句话，优先概括读者能得到什么
- `Category` 尽量保持稳定，不要频繁改出同义词分类
- `Tags` 控制数量，优先少而准

## 给 AI 的工作边界

如果以后你让 AI 帮你改这个 blog，最好把要求限制在这些边界里：

- 不新增第二套 CMS
- 不随意改动 `Status`、`Slug`、`Date`、`Category`、`Tags` 这些核心字段名
- 如果要改摘要逻辑，优先保持 `Summary` 为主、正文回退为辅
- 如果要改内容获取逻辑，先看 `/Users/yangxi/next-blog/lib/notion-schema.js`
