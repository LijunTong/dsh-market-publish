/**
 * Turn the check messages into a user-facing report: every failure keeps the
 * original reason and gains a concrete fix hint so the GUI can show what is
 * wrong and what to change.
 */

const HINTS = [
  [/缺少 dsh\.bundle\.patch/, '在 package.json 里加 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }，并创建该文件'],
  [/dsh\.bundle\.patch 指向的 (.+) 不存在/, (match) => `创建 ${match[1]}，或把 package.json 里的 patch 路径改成真实存在的文件`],
  [/远端 package\.json 没有 dsh\.bundle\.patch/, '先把本地改动提交并 push 到 GitHub，再重新检查'],
  [/缺少 version/, '在 package.json 里写 "version": "1.0.0" 这样的语义化版本号'],
  [/缺少英文描述/, '在 package.json 里写 description，或在界面上填英文描述'],
  [/英文描述要以句号结尾/, '在英文描述末尾补一个英文句号 "."'],
  [/中文描述要以句号结尾/, '在中文描述末尾补一个中文句号 "。"'],
  [/描述不要带营销词/, '删掉 revolutionary、powerful、神器、最强之类的词，只写插件做什么'],
  [/图标要填 https 地址/, '图标地址改成 https:// 开头'],
  [/图标必须托管在 GitHub 上/, '把图片放进插件仓库，用 raw.githubusercontent.com 的地址'],
  [/图标不要用 SVG/, '导出 PNG / JPEG / WebP 后再填'],
  [/图标格式要是 PNG/, '把图片转成 PNG / JPEG / WebP'],
  [/仓库还不满 (\d+) 天/, '仓库创建满 1 天后重新检查；差几小时也会被 CI 拦下'],
  [/仓库缺少 dsh-plugin topic/, '在 GitHub 仓库首页 About 里点齿轮，添加 topic：dsh-plugin'],
  [/仓库已归档/, '在仓库 Settings 里取消归档'],
  [/仓库是私有仓库/, '插件仓库必须是公开仓库'],
  [/GitHub 上找不到/, '确认仓库已 push、地址拼写正确、仓库是公开的'],
  [/远端 package\.json 解析失败/, '检查仓库里的 package.json 是否是合法 JSON'],
]

/**
 * @param {string} message
 * @returns {{ message: string, hint: string }}
 */
export function describeIssue(message) {
  const text = String(message)
  for (const [pattern, hint] of HINTS) {
    const match = pattern.exec(text)
    if (match === null) continue
    return { message: text, hint: typeof hint === 'function' ? hint(match) : hint }
  }
  return { message: text, hint: '按上面这句话逐条修掉，再重新检查一次' }
}

/**
 * @param {readonly string[]} issues
 * @returns {{ message: string, hint: string }[]}
 */
export function describeIssues(issues) {
  return issues.map(describeIssue)
}
