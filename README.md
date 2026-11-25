# dsh-market-publish

把一个 DeepSeek Harness 插件投稿到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的检查 + 提交工具。

投一个插件到市场，本质上是在清单仓库里新增一行 YAML：`data/plugins/<owner>__<repo>.yml`。这个工具把清单的准入规则（`contributing.md`）变成可执行的检查，本地跑一遍就知道还差什么，加上 `--apply` 会帮你 fork、提交、开 PR。

## 用法

在插件仓库根目录运行：

```bash
# 只检查 + 生成条目（不联网提交，条目写到系统临时目录并打印出来）
npx dsh-market-publish

# 指定分类与描述
npx dsh-market-publish --category git --zh "在输入框旁切换 Git 分支。"

# 真正投稿：fork + commit + 开 PR
GITHUB_TOKEN=xxx npx dsh-market-publish --apply
```

从源码跑：`node bin/cli.mjs`，参数相同。

## 它会检查什么

本地（读工作区的 `package.json`）：

- 声明了 `dsh.bundle.patch`，且指向的文件真实存在
- 有 `version`
- 描述像一句话（英文以 `.` 结尾，中文以 `。` 结尾），且没有营销词
- 图标只能是 GitHub 托管的 PNG / JPEG / WebP（SVG 和第三方图床会被 CI 拒）

远端（读 GitHub）：

- 仓库存在、公开、未归档
- 仓库创建**满 1 天**（CI 的硬门槛，差几小时也不行）
- 仓库带 `dsh-plugin` topic
- 默认分支上的 `package.json` 已经声明了 `dsh.bundle.patch`（本地改了没 push 会被这里抓到）

有问题会逐条列出并以 `1` 退出，不会写文件也不会提 PR。加 `--no-check` 可以跳过远端部分（离线只想看条目长什么样时有用）。

## 参数

| 参数 | 说明 |
| --- | --- |
| `--repo <owner/name>` | 目标仓库，默认从 `git remote get-url origin` 解析 |
| `--category <name>` | 清单分类，默认取 `package.json` 的 `keywords` 里第一个合法分类 |
| `--en <text>` | 英文描述，默认用 `package.json` 的 `description` |
| `--zh <text>` | 中文描述（可选） |
| `--icon <url>` | 图标地址（可选，必须 GitHub 托管位图） |
| `--tarball <url>` | release 包地址（可选） |
| `--out <path>` | 干跑时条目写到哪里，默认 `$TMPDIR/dsh-market-publish/<owner>__<repo>.yml` |
| `--dir <path>` | 插件目录，默认当前目录 |
| `--no-check` | 跳过 GitHub 侧检查 |
| `--apply` | fork + commit + 开 PR |
| `--json` | 输出机器可读结果 |
| `--help`, `-h` | 帮助 |

退出码：`0` 全部通过，`1` 还有问题（逐条打印），`2` 用法或环境错误。

## 认证

`--apply` 需要一个 `public_repo` 权限的 token，按顺序取：

1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `gh auth token`（已经 `gh auth login` 过就不用管 token 了）

token 只发给 `api.github.com`，不落盘、不打印。

## 作为库使用

`src/index.js` 导出了各个零件，可以直接在 CI 里复用检查逻辑：

```js
import { createClient, checkPackage, checkRepository } from 'dsh-market-publish'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const local = checkPackage({ dir: process.cwd(), pkg })
const remote = await checkRepository({ client: createClient(), repo: 'owner/name' })
console.log([...local.issues, ...remote.issues])
```

## 结构

| 路径 | 内容 |
| --- | --- |
| `bin/cli.mjs` | 命令行入口 |
| `src/cli.js` | 流程编排（参数、检查、写条目、提交） |
| `src/checks.js` | 准入规则：本地包、描述、图标、远端仓库 |
| `src/entry.js` | 清单条目的 YAML 生成 |
| `src/submit.js` | fork → 分支 → 提交条目 → 开 PR |
| `src/github.js` | GitHub REST 客户端与 token 解析 |
| `src/repo.js` | 读 `package.json`、从 remote 解析仓库名 |
| `src/categories.js` | 清单分类表 |
| `test/` | `node --test test/`，不联网 |

## 限制

- 只处理「新增/更新自己的那一行」，不碰 README（清单自动生成）
- 一个 PR 只投一个插件（清单要求一个 PR 最多 3 条）
- 仓库不满 1 天时只能等，工具会明确告诉你还差多少

MIT License，见 [LICENSE](./LICENSE)。
