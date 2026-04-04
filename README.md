# yancey.blog

一个基于 Next.js App Router 的个人博客，部署在 Vercel，文章内容来自 Notion Database。

## 当前架构

- 前端框架：Next.js 16 + React 19
- 部署平台：Vercel
- 内容源：Notion Database
- 评论系统：Giscus
- 附加功能：RSS、Sitemap、Open Graph、站内搜索、阅读页数据同步

## 项目结构

```text
app/
  (web)/                页面路由
  api/                  服务端接口
components/             页面组件
lib/                    内容获取、站点配置、schema 定义
docs/                   项目维护文档
```

关键文件：

- `/Users/yangxi/next-blog/lib/site-config.js`：站点名称、域名、作者、社交链接
- `/Users/yangxi/next-blog/lib/notion-schema.js`：Notion 字段与状态值约定
- `/Users/yangxi/next-blog/lib/posts.js`：Notion 查询、文章映射、摘要生成
- `/Users/yangxi/next-blog/docs/NOTION_CONTENT_MODEL.md`：Notion 内容模型说明

## 功能说明

### Blog 主链路

- 首页、文章列表、标签页、分类页都从 Notion 读取内容
- 文章详情页按 `Slug` 动态生成，并使用 ISR 缓存
- 如果文章没有填写 `Summary`，系统会从正文自动生成摘要
- 文章图片通过 `/api/notion-image` 代理，规避 Notion 图片签名 URL 过期问题

### 搜索

- 搜索数据来自 `/api/search`
- 当前支持按标题、摘要、分类、标签搜索
- 为了避免 Notion API 限流，搜索接口只返回轻量元数据，不抓取全文块内容

### 阅读页

- `/reading` 是独立功能模块
- 目前依赖 GitHub Gist 持久化书单数据
- 使用到 `GITHUB_PAT` 和 `MASTER_GIST_ID`

## 环境变量

本地开发使用 `.env.local`。

### Blog / Notion

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

### Giscus / GitHub

- `GITHUB_PAT`

### Reading

- `MASTER_GIST_ID`

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

常用校验：

```bash
npm run lint
npm run build
```

说明：

- 当前仓库整体 `lint` 里还有一部分 `reading` 模块的旧告警/报错需要单独处理
- blog 主链路相关文件已经过定向校验，并可正常 `build`

## 内容工作流

1. 在 Notion Database 中创建或编辑文章
2. 填写 `Name`、`Slug`、`Date`、`Status`、`Category`
3. 可选填写 `Tags`、`Summary`、`Cover`
4. 将 `Status` 设为 `完成`
5. 等待 Vercel ISR 刷新，或触发新部署

更具体的字段规范见：

- `/Users/yangxi/next-blog/docs/NOTION_CONTENT_MODEL.md`

## 部署流程

### GitHub

- 主代码仓库存放在 GitHub
- 推送到默认分支后，Vercel 会自动触发部署

### Vercel

- 在 Vercel 项目中配置与本地一致的环境变量
- 确保 Production 和 Preview 环境都设置好 `NOTION_TOKEN` 与 `NOTION_DATABASE_ID`
- 如果使用阅读页写入功能，也要配置 `GITHUB_PAT` 和 `MASTER_GIST_ID`

更具体的部署检查项见：

- `/Users/yangxi/next-blog/DEPLOYMENTING_GUIDE.md`
- `/Users/yangxi/next-blog/docs/PUBLIC_REPO_PRECOMMIT_CHECKLIST.md`

## 维护建议

- 保持 Notion 为唯一 blog 内容源，不要再引入第二套 CMS
- Notion 字段名尽量固定，不要随意改 `Slug`、`Status`、`Date`、`Category`
- 与 AI 协作时，尽量一次只改一个明确范围，比如“只改首页 hero”或“只改搜索逻辑”
- 大改前先跑 `npm run build`

## 后续建议

当前最值得继续推进的方向：

1. 单独修复 `reading` 模块的 lint 问题
2. 重做首页信息架构和视觉层次
3. 给 Notion 内容变更补一个更明确的刷新机制
4. 加一个基础 CI，在 push 时自动跑 `build`
