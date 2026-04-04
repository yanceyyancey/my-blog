# Public Repo Pre-Commit Checklist

适用于当前这个公开仓库。每次 `git add` / `git commit` / `git push` 前，先快速过一遍。

## 1. 先看这次到底要提交什么

```bash
git status --short
git diff --stat
git diff --cached
```

确认：

- 没有把不相关文件一起带上
- 没有误删内容源文件或配置文件
- 没有把临时调试改动一并提交

## 2. 检查敏感文件有没有混进来

重点确认这些文件没有进入暂存区：

- `.env.local`
- `.env.*`
- `*.pem`
- `*.key`
- `id_rsa`
- `id_ed25519`
- 本地调试日志，如 `dev_output.log`

可用命令：

```bash
git diff --cached --name-only
```

## 3. 检查有没有把密钥、Token、私钥写进代码

重点搜索：

- OpenAI key
- GitHub token / PAT
- Notion token
- AWS key
- Bearer token
- 私钥内容

可用命令：

```bash
rg -n --hidden -S 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|Bearer ' . --glob '!node_modules' --glob '!.git'
```

说明：

- 环境变量名出现在代码里通常没问题，比如 `process.env.NOTION_TOKEN`
- 真正不能提交的是密钥的实际值

## 4. 公开仓库要特别留意日志和测试文件

确认这些内容没有暴露真实数据：

- 调试日志
- 本地脚本输出
- 临时测试脚本
- 报错截图导出的文本
- 含真实用户数据的 JSON / CSV / txt

## 5. 服务端代码要确认“秘密只在环境变量里”

对于 API 路由和服务端逻辑，确认：

- Token 只从 `process.env` 读取
- 没有把真实 token 写死在请求头里
- 没有把敏感值打印到 `console.log`
- 返回给前端的错误信息里不包含敏感字段

## 6. 提交前再看一次 `.gitignore`

如果这次新增了本地文件类型，先想一件事：

- 这个文件以后是否应该默认忽略

当前仓库至少应忽略：

- `.env*`
- `dev_output.log`
- `node_modules`
- `.next`
- `.vercel`

## 7. 公开仓库的最后确认

提交前问自己这 4 个问题：

- 这个文件如果任何人都能看到，会不会有风险？
- 这里面有没有账号、密钥、访问入口、内部地址？
- 这里面有没有不该公开的真实数据？
- 这次提交是否只包含本次任务必须的改动？

只要其中一个答案不确定，就先不要提交。

## 8. 建议的最小提交流程

```bash
git status --short
git diff
git add <明确要提交的文件>
git diff --cached
npm run lint
git commit -m "your message"
git push
```

## 9. 如果怀疑已经泄露了

立刻做这几件事：

1. 先停止继续推送
2. 立刻轮换对应密钥
3. 从仓库中删除当前文件内容
4. 如果密钥已经进入历史，继续处理 Git 历史或直接废弃旧密钥
5. 检查 Vercel / GitHub / Notion 等平台日志是否有异常访问
