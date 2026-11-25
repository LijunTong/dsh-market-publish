# dsh-market-publish

把一个 DeepSeek Harness 插件投稿到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的检查 + 提交工具。

投一个插件到市场，本质上是在清单仓库里新增一行 YAML：`data/plugins/<owner>__<repo>.yml`。这个工具把清单的准入规则（`contributing.md`）变成可执行的检查，本地跑一遍就知道还差什么，加上 `--apply` 会帮你 fork、提交、开 PR。

也提供一个本地图形界面：填一个 GitHub 地址（或本地目录），点几下就能完成检查、开收录 PR 和发布到 npm。

详细的分步操作、参数说明与错误对照见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)。

## 安装

只依赖 Node.js 20 或更新版本，没有第三方依赖：

```bash
git clone https://github.com/LijunTong/dsh-market-publish.git
```

## 图形界面

不想记参数时启动本地界面（默认监听 `http://127.0.0.1:4780`）：

```bash
npm run gui          # 等价于 node bin/gui.mjs
# 端口被占用时：DSH_MARKET_PORT=4781 node bin/gui.mjs
```

页面上只填一个地址就够：

1. **插件地址** 填 `https://github.com/owner/repo`（自动浅克隆到临时目录，用完即删），或填本地已 clone 的插件目录路径。
2. 点 **检查**：通过就直接给出条目预览；不通过逐条列出「哪里不对 + 怎么改」，改完再点一次即可。
3. 点 **开收录 PR**：`fork → 分支 → 提交条目 → 开 PR`，成功后按钮位置变成 PR 链接。
4. 下面的 **发布到 npm**：先读 `npm pack --dry-run` 的文件清单和体积，再点一次 **确认发布** 才会真的 `npm publish`。

GitHub token 留空时按下面「认证」一节的顺序取；npm token 留空时用本机 `npm login` 的登录态。界面和命令行共用同一套检查代码，结论一致。

## 用法

也可以只用命令行。在任意目录运行，用 `--dir` 指向你的插件仓库（把两个尖括号部分换成实际路径）：

```bash
# 只检查 + 生成条目（不联网提交，条目写到系统临时目录并打印出来）
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录>

# 指定分类与描述
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录> --category git --zh "在输入框旁切换 Git 分支。"

# 真正投稿：fork + commit + 开 PR
GITHUB_TOKEN=xxx node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录> --apply
```

`--dir` 可省略（当前目录就是插件仓库时）；仓库没有 `origin` remote 时加 `--repo owner/name`。

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
| `bin/gui.mjs` | 图形界面入口（启动本地 HTTP 服务） |
| `src/server.js` | 界面背后的 HTTP 接口：检查、开 PR、发 npm |
| `src/workspace.js` | 把「GitHub 地址 / 本地目录」变成可检查的工作区 |
| `src/report.js` | 把检查结论翻译成「原因 + 改法」 |
| `src/npm.js` | npm 包体检与发布（token 只进子进程环境） |
| `public/` | 界面本身：`index.html`、`app.js`、`style.css` |
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
- 发 npm 需要本机有 `npm` 和对应账号；同名版本已存在时工具会拦下，先改版本号
- 图形界面只监听 `127.0.0.1`，token 只在单次请求的内存里使用，不落盘也不打印

MIT License，见 [LICENSE](./LICENSE)。
