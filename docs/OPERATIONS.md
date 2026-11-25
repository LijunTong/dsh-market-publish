# 操作说明

这份文档面向两类人：

- 第一次把自己的 DSH 插件投稿到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的作者；
- 已经投过稿、需要更新条目或用 CI 复检检查逻辑的人。

工具本身只做一件事：在插件仓库里按清单规则检查一遍，生成 `data/plugins/<owner>__<repo>.yml`，必要时 fork 清单仓库、提交这个文件、开 PR。它不碰 README，也不改你的插件代码。

---

## 0. 准备：克隆这个工具

工具只依赖 Node.js 20 或更新版本，没有任何第三方依赖，克隆下来就能用：

```bash
git clone <工具仓库地址> dsh-market-publish
```

## 0.1 最短路径

不用切换目录：在任意位置运行，用 `--dir` 指向你的插件仓库。下文统一写作 `node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录>`，把两个尖括号部分换成实际路径。

```bash
# 1. 只检查 + 生成条目（不联网提交）
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录>

# 2. 按输出把「还差这些」逐条修掉，再跑一次，确认退出码为 0

# 3. 真正投稿：fork + commit + 开 PR
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录> --apply
```

`--dir` 可以省略：当前目录就是插件仓库时直接跑。插件仓库没有 origin remote 时，再加 `--repo owner/name`。

`--apply` 需要 GitHub token。已经 `gh auth login` 过就不必再设，否则：

```bash
# macOS / Linux / Git Bash
export GITHUB_TOKEN=ghp_xxx

# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxx"
```

---

## 1. 投稿前：先满足这些条件

清单的 CI 和人工评审看的是同一组条件。工具能自动查的会查，查不了的会写在下面的「怎么确认」里。

| # | 条件 | 怎么确认 | 不满足会怎样 |
| --- | --- | --- | --- |
| 1 | 仓库公开、未归档、能访问 | 打开 GitHub 仓库页 | 工具报「私有仓库 / 已归档 / 找不到」 |
| 2 | 仓库创建满 **1 天** | 仓库页右侧 About 的创建时间 | 工具报「还不满 1 天」，CI 也会拦 |
| 3 | 仓库带 `dsh-plugin` topic | 仓库首页 About → Topics | 工具报「缺少 dsh-plugin topic」 |
| 4 | `package.json` 有 `version` | 打开 `package.json` | 工具报「缺少 version」 |
| 5 | `package.json` 声明了 `dsh.bundle.patch`，且文件真实存在 | `ls` 一下 patch 指向的文件 | 工具报「缺少 dsh.bundle.patch」或「指向的文件不存在」 |
| 6 | 英文描述是一句话，以 `.` 结尾 | 看 `description` 或 `--en` 参数 | 工具报「英文描述要以句号结尾」 |
| 7 | 描述不带营销词 | 见下方「营销词」 | 工具报「描述不要带营销词」 |
| 8 | 本地改动已经 push 到 GitHub | `git status` / `git log origin/main` | 工具报「远端 package.json 没有 dsh.bundle.patch」 |

两个最容易踩的坑：

- **只声明 `dsh.client` 不算数。** 市场靠 `dsh.bundle` 判断能否用 `dsh plugin add` 安装。正确写法：

  ```json
  {
    "dsh": {
      "bundle": { "patch": "./cordis.patch.yml" },
      "client": { "platform": "web" }
    }
  }
  ```

  并且仓库根目录真的有一个 `cordis.patch.yml`。

- **本地改了不等于线上改了。** 工具会读默认分支上的 `package.json`。本地有 `dsh.bundle.patch`、没 push，远端检查这一项就会失败。

营销词是这几个（不区分大小写）：`revolutionary`、`best-in-class`、`best in class`、`amazing`、`powerful`、`game-chang…`、`神器`、`最强`、`炸裂`、`颠覆`。描述只写「它做什么」即可。

---

## 2. 五步操作

### 第 1 步：自检

```bash
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录>
```

工具会：

1. 读 `--dir` 指向目录（默认当前目录）的 `package.json`；
2. 从 `git remote get-url origin` 解析 `owner/name`（解析不到就用 `--repo` 指定）；
3. 从 `keywords` 里找第一个合法分类（找不到就用 `--category` 指定）；
4. 跑本地检查，再跑 GitHub 侧检查（`--no-check` 可跳过）；
5. 把清单条目打印出来。

正常输出大致长这样（字段值随你的仓库变化）：

```text
仓库      owner/name
分类      git
版本      my-plugin@0.1.0
条目文件  data/plugins/owner__name.yml
· dsh.bundle.patch = ./cordis.patch.yml
· 仓库创建于 2026-11-20（5.2 天）
· 已带 dsh-plugin topic
· 远端 dsh.bundle.patch = ./cordis.patch.yml

--- 条目内容 ---
url: https://github.com/owner/name
name: owner/name
category: git
description:
  en: '在输入框旁切换 Git 分支。'
```

带 `·` 的行是提示（notes），不是错误；带 `✗` 的才是要修的问题。

### 第 2 步：按「还差这些」逐条修

有问题时输出会多出一段：

```text
--- 还差这些 ---
✗ 仓库缺少 dsh-plugin topic —— 在仓库首页 About 的 Topics 里加上

先修好再提交；上面这些问题 CI 或维护者都会打回。
```

此时退出码是 `1`，工具**不会写文件、不会开 PR**。对照第 6 节的错误表修，然后重跑第 1 步，直到没有 `✗`。

### 第 3 步：确认条目内容

检查通过后，干跑会把条目写到系统临时目录并打印路径：

```text
已写入 C:\Users\<你>\AppData\Local\Temp\dsh-market-publish\owner__name.yml
检查通过。真正投稿（fork + commit + PR）：
  dsh-market-publish --apply
```

想写到指定位置、或想直接看文件，用 `--out`：

```bash
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录> --out ./owner__name.yml
```

确认这几点再往下走：

- `url` 是 `https://github.com/<owner>/<repo>`；
- `name` 是 `owner/repo`；
- `category` 是插件实际做的事，不是你想让它出现的位置；
- `description.en` 以 `.` 结尾，且没有夸大；
- 可选字段（`zh`、`icon`、`tarball`）符合第 3 节的要求。

### 第 4 步：正式投稿

```bash
node <dsh-market-publish 目录>/bin/cli.mjs --dir <插件目录> --apply
```

这一步会：

1. 用 token 调 `/user` 确认身份；
2. fork `awesome-dsh-plugin/awesome-dsh-plugin` 到你的账号；
3. 轮询等 fork 就绪（最多 20 次 × 3 秒 = 60 秒）；
4. 从 `main` 建分支 `add-<owner>-<repo>`（例如 `add-owner-name`）；
5. 写入 `data/plugins/<owner>__<repo>.yml`；
6. 向清单仓库开 PR，标题是 `Add <owner>/<repo>`。

输出形如：

```text
→ fork awesome-dsh-plugin/awesome-dsh-plugin → <你>/awesome-dsh-plugin
→ branch add-owner-name
→ data/plugins/owner__name.yml

PR 已创建：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/123
```

重跑是安全的：分支名是固定的，已存在就复用；条目文件已存在就更新（带上文件 sha）。但**如果这个分支已经有一个开着的 PR**，工具会停下来提示你去看，而不会重复开第二个。

### 第 5 步：PR 之后

- **等 CI。** CI 依次检查：条目数（一个 PR 最多 3 条）、`dsh.bundle`、仓库年龄、`awesome-lint` 与站点构建。红了会指出改什么。
- **收到 `held: author` 标签不是拒绝。** 维护者要求修改时会打这个标签。把修复推到**同一个分支**，再留一条评论说明改了什么即可；标签只能靠重新评审摘掉，不会自动消失。
- **不要手改 README。** 两个 README 由 `data/plugins/*.yml` 生成。你的 PR 只应该包含一个条目文件。
- **合并后不用做任何事。** 网站会自动重建。

---

## 3. 常见场景配方

| 场景 | 做法 |
| --- | --- |
| 自动选不到分类 | `--category git`（可选值见附录） |
| 想临时换英文描述 | `--en "Switch Git branches next to the input box."` |
| 补中文描述 | `--zh "在输入框旁切换 Git 分支。"`（可选；不写维护者会补） |
| 指定图标 | `--icon https://raw.githubusercontent.com/<owner>/<repo>/main/assets/icon-180.png` |
| 指定 release 包 | `--tarball https://github.com/<owner>/<repo>/releases/download/v1.2.0/my-plugin-1.2.0.tgz` |
| 离线/只想看条目 | `--no-check` |
| 在别的目录跑 | `--dir ../my-plugin` |
| 仓库名解析不到 | `--repo owner/name` |
| 给脚本/CI 用 | `--json` |
| 更新自己已收录的条目 | 改好 `package.json` 后重跑 `--apply`，分支和文件都会复用 |

几个字段的硬要求：

- **图标**：必须是 GitHub 托管的位图，`png` / `jpg` / `jpeg` / `webp`。`github.com`、`raw.githubusercontent.com`、`user-images.githubusercontent.com`、任意 `*.githubusercontent.com` 都可以；SVG 和第三方图床会被 CI 拒。
- **tarball**：工具只原样写入，不校验。按清单要求填 GitHub Release 托管的 `https` `.tgz`。用 `releases/latest/download/` 时，资产文件名不要带版本号，否则下次发版就会 404；要么改用 `releases/download/<tag>/...` 钉住版本。
- **monorepo 子包**：清单支持 `url` 指向子目录、`name` 用 `owner/repo#subname`、文件名 `owner__repo--packages-my-plugin.yml`，但**当前工具只生成根仓库形态**（`url` 指向仓库根、`name` 是 `owner/repo`、文件名 `owner__repo.yml`）。子包投稿请先用工具生成，再手工改这三处，或直接手写条目。
- **截图**：不在条目里。在插件仓库的 `package.json` 旁边放 `screenshots.json`，列出 1–8 张相对路径图片。
- **npm 包**：可选，不影响收录。发布时 `repository` 字段要指回被收录的仓库。

---

## 4. 参数参考

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--repo <owner/name>` | 字符串 | `git remote get-url origin` 解析结果 | 目标 GitHub 仓库 |
| `--category <name>` | 附录中的分类 | `keywords` 里第一个合法分类 | 清单分类 |
| `--en <text>` | 字符串 | `package.json` 的 `description` | 英文描述，必须以 `.` 结尾 |
| `--zh <text>` | 字符串 | 无 | 中文描述，可选，写了必须以 `。` 结尾 |
| `--icon <url>` | https URL | 无 | GitHub 托管位图 |
| `--tarball <url>` | https URL | 无 | release 包地址，工具不校验 |
| `--out <path>` | 路径 | `$TMPDIR/dsh-market-publish/<owner>__<repo>.yml` | 干跑时条目写到哪里；相对路径按当前目录解析 |
| `--dir <path>` | 路径 | 当前目录 | 插件目录 |
| `--no-check` | 开关 | 关 | 跳过 GitHub 侧检查 |
| `--apply` | 开关 | 关 | fork + commit + 开 PR |
| `--json` | 开关 | 关 | 输出机器可读结果，抑制人类可读输出 |
| `--help`, `-h` | 开关 | — | 打印用法 |

`--json` 的输出字段：`ok`、`repo`、`category`、`package`、`entryPath`、`entry`、`issues`、`notes`、`writtenTo`、`pullRequest`。

---

## 5. 退出码与认证

| 退出码 | 含义 |
| --- | --- |
| `0` | 全部通过；干跑已写条目，或 `--apply` 已开 PR |
| `1` | 插件或仓库还有问题（逐条打印）；或提交阶段失败 |
| `2` | 用法或环境错误：参数错、读不到 `package.json`、无法确定仓库、分类无效 |

`--apply` 的 token 按顺序取：

1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `gh auth token`（已经 `gh auth login` 过就不用管）

token 需要 `public_repo` 权限。它只发给 `api.github.com`，不落盘、不打印。不要把 token 写进仓库、脚本或提交信息。

---

## 6. 错误与提示对照表

### 6.1 参数与环境

| 提示 | 原因 | 处理 |
| --- | --- | --- |
| `参数错误：unknown option: --xxx` | 参数名拼错或不存在 | 对照第 4 节 |
| `参数错误：--repo needs a value` | 需要值的参数后面没跟值 | 补上值 |
| `参数错误：unexpected argument: xxx` | 多传了位置参数 | 删掉或改成 `--dir` |
| `找不到 <path> —— 请在插件仓库根目录运行，或用 --dir 指定` | 当前目录没有 `package.json` | 用 `--dir` 指向插件根目录 |
| `<path> 不是合法 JSON：...` | `package.json` 语法错误 | 修 JSON |
| `无法确定目标仓库：用 --repo owner/name 指定，或先 git remote add origin <GitHub 地址>` | 没有 origin，或 origin 不是 GitHub | 加 remote 或 `--repo` |
| `分类无效或缺失：用 --category 指定，可选 ...` | `keywords` 里没有合法分类，或 `--category` 拼错 | `--category` 选附录里的值 |

### 6.2 本地检查

| 提示 | 原因 | 处理 |
| --- | --- | --- |
| `package.json 缺少 dsh.bundle.patch —— 市场靠它判断能否用 dsh plugin add 安装` | 只声明了 `dsh.client`，或根本没写 `dsh.bundle` | 加 `"bundle": { "patch": "./cordis.patch.yml" }` |
| `dsh.bundle.patch 指向的 <file> 不存在` | 路径写错，或文件没进仓库 | 改路径或补文件 |
| `package.json 缺少 version` | 没写 `version` | 补上 |
| `缺少英文描述：用 --en 指定，或在 package.json 里写 description` | `description` 为空 | 补描述或 `--en` |
| `英文描述要以句号结尾（contributing.md 要求）` | 结尾不是 `.` | 补句号 |
| `中文描述要以句号结尾` | `--zh` 结尾不是 `。` | 补全角句号 |
| `描述不要带营销词` | 命中第 1 节的营销词 | 改成功能描述 |
| `图标要填 https 地址` | `--icon` 不是 `https://` | 换 https 地址 |
| `图标地址无法解析` | URL 不合法 | 检查 URL |
| `图标必须托管在 GitHub 上（仓库文件或 user-images 附件），第三方图床会被拒` | 域名不在白名单 | 把图放进仓库或 GitHub 附件 |
| `图标不要用 SVG，PNG / JPEG / WebP 才可以` | 用了 `.svg` | 换位图 |
| `图标格式要是 PNG / JPEG / WebP` | 扩展名不是位图 | 换位图 |

提示行（`·`，不是错误）：

- `dsh.bundle.patch = <file>`：读到的 patch 路径。
- `同时带 dsh.client（<platform>）`：声明了前端平台。
- `提示：package.json 的 files 里建议包含 patch 文件`：发布 npm 时 patch 文件可能没被打进包里。

### 6.3 远端检查

| 提示 | 原因 | 处理 |
| --- | --- | --- |
| `GitHub 上找不到 <repo> —— 先把仓库推上去再投稿` | 仓库不存在，或名字不对 | 先 push，或 `--repo` 修正 |
| `读取 /repos/<repo> 失败：<status>` | 网络/权限/限流 | 稍后重试；必要时设 token |
| `仓库还不满 1 天，CI 会拦下；过几小时再提即可` | 创建时间不足 24 小时 | 等够时间再跑 |
| `仓库已归档` | 仓库被归档 | 取消归档 |
| `仓库是私有仓库` | 仓库私有 | 改为公开 |
| `仓库缺少 dsh-plugin topic —— 在仓库首页 About 的 Topics 里加上` | 没加 topic | 在 About 里加 `dsh-plugin` |
| `远端 package.json 解析失败` | 默认分支上的 `package.json` 不是合法 JSON | 修好并 push |
| `远端 package.json 没有 dsh.bundle.patch —— 请先把本地改动 push 到 GitHub` | 本地改了没 push | push 后重跑 |

### 6.4 提交阶段（`--apply`）

| 提示 | 原因 | 处理 |
| --- | --- | --- |
| `--apply 需要 token：设置 GITHUB_TOKEN（或 GH_TOKEN），或先 gh auth login` | 没找到 token | 按第 5 节设置 |
| `fork <你>/awesome-dsh-plugin 未就绪，稍后重试` | GitHub 还没建好 fork（超过 60 秒） | 等一会儿重跑；重跑会复用 fork |
| `已有针对 <你>:<branch> 的 PR，去 <upstream> 看一下` | 同分支已有开着的 PR | 直接去那个 PR 上改，不要重开 |
| `创建 PR 失败：<status> <message>` | 权限、限流或清单仓库规则 | 按 message 处理；确认 token 有 `public_repo` |
| `失败：...` | 提交过程中其他 API 错误 | 按错误里的状态码和 message 排查 |

---

## 7. 常见问题

**Q：能像别的工具那样用 `npx` 直接跑吗？**
暂时不能。本工具还没发布到 npm，`npx dsh-market-publish` 会报 `404 Not Found`。按第 0 节把仓库克隆下来，用 `node <克隆目录>/bin/cli.mjs` 运行，效果完全一样。

**Q：仓库刚建，非要等满 1 天吗？**
是，CI 硬门槛。差几小时也不行，工具会告诉你还差多少。等够再提，重新提交没有惩罚。

**Q：描述里有冒号会不会把 YAML 弄坏？**
不会。工具用单引号包住描述，并把内部单引号转义成两个，`:` 和中文都不会出问题。

**Q：一个 PR 能投几个插件？**
清单上限是 3 条，但本工具一次只处理一个。多个插件就分多次跑。

**Q：能重复跑 `--apply` 吗？**
可以。分支名固定，重跑会复用分支、更新同一个条目文件。但如果 PR 已经开着，工具会停下让你去原 PR 处理。

**Q：PR 的 CI 红了怎么办？**
先看是哪一步。`READMEs match data/plugins` 这类通常不归你修（维护者合并时会重新生成）；`awesome-lint` 或陈旧 fork 守卫归你修。把修复推到同一分支即可。

**Q：需要发 npm 包吗？**
不需要，不影响收录。发了只是市场能显示下载量。

**Q：需要准备截图吗？**
不强制。想控制展示顺序，就在插件仓库放 `screenshots.json`。

**Q：聚合包（只依赖别的插件、自己没行为）能收录吗？**
不能。清单收的是单个插件；聚合包请只投它包含的插件。

---

## 8. 在 CI 里复用检查逻辑

`src/index.js` 导出了各个零件，可以不跑 CLI 直接复用：

```js
import { readFileSync } from 'node:fs'
import { createClient, checkPackage, checkRepository } from 'dsh-market-publish'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const local = checkPackage({ dir: process.cwd(), pkg })
const remote = await checkRepository({ client: createClient(), repo: 'owner/name' })
console.log([...local.issues, ...remote.issues])
```

也可以直接 `import { main } from 'dsh-market-publish'`，注入自己的 `argv`、`env`、`out`、`err`、`fetchImpl`，在测试里跑完整流程。

---

## 9. 不要做的事

- 不要手改清单仓库的 README，也不要在自己的 PR 里带 README 改动。
- 不要一个 PR 塞超过 3 条，更不要塞几十条。
- 不要在描述里写「最强」「颠覆」这类词，也不要写代码里不存在的数字和 API。
- 不要把只依赖别人插件的聚合包当插件投。
- 不要把 token 写进仓库、脚本、日志或提交信息。

---

## 附录：分类

工具内置的分类（与清单的 `data/categories.yml` 保持同步；分类会随上游调整，以工具输出的可选列表为准）：

| key | 常见含义 |
| --- | --- |
| `agi` | AGI / 智能体 |
| `ui` | 界面增强 |
| `usage` | 用量与使用情况 |
| `theme` | 主题与外观 |
| `model` | 模型接入 |
| `identity` | 身份与账号 |
| `session` | 会话 |
| `memory` | 记忆 |
| `tools` | 工具 |
| `wsl` | WSL 集成 |
| `browser` | 浏览器 |
| `vision` | 视觉 / 识图 |
| `voice` | 语音 |
| `docs` | 文档 |
| `skill` | 技能 |
| `workflow` | 工作流 |
| `git` | Git |
| `notify` | 通知 |
| `dev` | 开发辅助 |
| `security` | 安全 |
| `remote` | 远程 |
| `market` | 市场 |
| `fun` | 娱乐 |

选最贴近插件实际行为的那个即可。分类选得不够准不会被打回，维护者会直接改。
