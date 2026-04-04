# Deployment Guide

这个项目的线上链路是：

`GitHub -> Vercel -> Notion`

代码在 GitHub，站点部署在 Vercel，文章内容从 Notion Database 拉取。

## 上线前检查

### 1. GitHub 仓库

- 仓库代码与本地一致
- 默认分支已连接到 Vercel
- 如果启用了评论，仓库需要开启 Discussions

### 2. Vercel 环境变量

至少要配置：

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

如果要启用阅读页写入功能，还需要：

- `GITHUB_PAT`
- `MASTER_GIST_ID`

### 3. Notion 数据库

建议确保这些字段存在并命名稳定：

- `Name`
- `Slug`
- `Date`
- `Status`
- `Category`
- `Tags`
- `Summary`
- `Cover`

发布文章时：

- `Status = 完成`
- 如果是日志流内容，`Category = Journal`

## 发布步骤

### 从本地推送到 GitHub

```bash
git add .
git commit -m "docs: update project documentation"
git push
```

### 等待 Vercel 自动部署

推送到已连接分支后，Vercel 会自动开始构建。

建议在 Vercel 后台确认：

- Build 成功
- 没有环境变量缺失
- 首页和文章页都能正常访问

## 部署后验证

至少检查下面几项：

- 首页 `/`
- 文章列表 `/blog`
- 任意文章详情页 `/blog/[slug]`
- 分类页 `/categories`
- 标签页 `/tags/[name]`
- RSS `/feed.xml`
- Sitemap `/sitemap.xml`

如果文章刚刚在 Notion 发布但线上还没更新，通常是 ISR 缓存窗口还没到，不一定是部署失败。

## 常见问题

### 文章没有显示

优先检查：

- `Status` 是否为 `完成`
- `Slug` 是否为空
- `NOTION_TOKEN` 是否有权限访问该数据库
- `NOTION_DATABASE_ID` 是否正确

### 搜索结果里没有摘要

优先检查：

- 是否填写了 `Summary`
- 没填时是否有正文内容可用于自动生成摘要

### 图片失效

Notion 原始图片链接会过期，当前项目通过 `/api/notion-image` 做了代理。

如果仍然异常，优先检查：

- Notion token 权限
- 图片 block 是否仍存在
- Vercel 函数日志里是否有接口报错

## 建议

- 大改动前先在本地跑 `npm run build`
- 不要把 blog 内容源同时维护在 Notion 和另一套 CMS
