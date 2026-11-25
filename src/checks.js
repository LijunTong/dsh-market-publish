/**
 * Admission rules from awesome-dsh-plugin `contributing.md`, split into the
 * checks that only need the local package and the ones that need GitHub.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const MIN_AGE_DAYS = 1
export const REQUIRED_TOPIC = 'dsh-plugin'

const MARKETING = /revolutionary|best[- ]in[- ]class|amazing|powerful|game[- ]chang|神器|最强|炸裂|颠覆/i

/**
 * @typedef {{ issues: string[], notes: string[] }} Report
 */

/** @returns {Report} */
function report() {
  return { issues: [], notes: [] }
}

/**
 * Rules that are visible in the working copy.
 *
 * @param {{ dir: string, pkg: any }} options
 * @returns {Report}
 */
export function checkPackage(options) {
  const { dir, pkg } = options
  const result = report()

  const patch = pkg.dsh?.bundle?.patch
  if (typeof patch !== 'string' || patch === '') {
    result.issues.push('package.json 缺少 dsh.bundle.patch —— 市场靠它判断能否用 dsh plugin add 安装')
  } else if (!existsSync(join(dir, patch))) {
    result.issues.push(`dsh.bundle.patch 指向的 ${patch} 不存在`)
  } else {
    result.notes.push(`dsh.bundle.patch = ${patch}`)
  }

  if (typeof pkg.version !== 'string' || pkg.version === '') {
    result.issues.push('package.json 缺少 version')
  }

  const platform = pkg.dsh?.client?.platform
  if (typeof platform === 'string' && platform !== '') {
    result.notes.push(`同时带 dsh.client（${platform}）`)
  }

  if (Array.isArray(pkg.files) && typeof patch === 'string') {
    if (!pkg.files.includes('cordis.patch.yml') && !pkg.files.some((entry) => String(entry) === patch)) {
      result.notes.push('提示：package.json 的 files 里建议包含 patch 文件')
    }
  }

  return result
}

/**
 * The list editor reads two sentences; both must look like sentences and
 * neither may oversell the plugin.
 *
 * @param {{ en: string, zh?: string }} options
 * @returns {string[]}
 */
export function checkDescriptions(options) {
  const issues = []
  const en = (options.en ?? '').trim()
  const zh = (options.zh ?? '').trim()
  if (en === '') {
    issues.push('缺少英文描述：用 --en 指定，或在 package.json 里写 description')
  } else if (!en.endsWith('.')) {
    issues.push('英文描述要以句号结尾（contributing.md 要求）')
  }
  if (zh !== '' && !zh.endsWith('。')) issues.push('中文描述要以句号结尾')
  if (MARKETING.test(en) || MARKETING.test(zh)) issues.push('描述不要带营销词')
  return issues
}

/**
 * Icons must be a raster image hosted on GitHub; SVGs and third-party hosts are
 * rejected by the list CI.
 *
 * @param {string | undefined} icon
 * @returns {string[]}
 */
export function checkIcon(icon) {
  if (icon === undefined) return []
  const url = icon.trim()
  if (!/^https:\/\//i.test(url)) return ['图标要填 https 地址']
  let hostname = ''
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return ['图标地址无法解析']
  }
  const allowed =
    hostname === 'github.com' ||
    hostname === 'raw.githubusercontent.com' ||
    hostname === 'user-images.githubusercontent.com' ||
    hostname.endsWith('.githubusercontent.com')
  if (!allowed) return ['图标必须托管在 GitHub 上（仓库文件或 user-images 附件），第三方图床会被拒']
  if (/\.svg(?:$|\?)/i.test(url)) return ['图标不要用 SVG，PNG / JPEG / WebP 才可以']
  if (!/\.(?:png|jpe?g|webp)(?:$|\?)/i.test(url)) return ['图标格式要是 PNG / JPEG / WebP']
  return []
}

/**
 * @param {string} iso
 * @returns {number}
 */
export function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

/**
 * Rules that need the published repository.
 *
 * @param {{
 *   client: { request: (path: string, init?: any) => Promise<{ status: number, ok: boolean, data: any }> },
 *   fetchText?: (url: string) => Promise<{ ok: boolean, text: string }>,
 *   repo: string,
 *   defaultBranch?: string,
 *   minAgeDays?: number,
 * }} options
 * @returns {Promise<Report>}
 */
export async function checkRepository(options) {
  const { client, repo } = options
  const minAgeDays = options.minAgeDays ?? MIN_AGE_DAYS
  const result = report()

  const info = await client.request(`/repos/${repo}`, { auth: false })
  if (info.status === 404) {
    result.issues.push(`GitHub 上找不到 ${repo} —— 先把仓库推上去再投稿`)
    return result
  }
  if (!info.ok) {
    result.issues.push(`读取 /repos/${repo} 失败：${info.status}`)
    return result
  }

  const data = info.data ?? {}
  if (typeof data.created_at === 'string') {
    const age = daysSince(data.created_at)
    result.notes.push(`仓库创建于 ${data.created_at.slice(0, 10)}（${age.toFixed(1)} 天）`)
    if (age < minAgeDays) {
      result.issues.push(`仓库还不满 ${minAgeDays} 天，CI 会拦下；过几小时再提即可`)
    }
  }
  if (data.archived === true) result.issues.push('仓库已归档')
  if (data.private === true) result.issues.push('仓库是私有仓库')

  const topics = Array.isArray(data.topics) ? data.topics : []
  if (!topics.includes(REQUIRED_TOPIC)) {
    result.issues.push(`仓库缺少 ${REQUIRED_TOPIC} topic —— 在仓库首页 About 的 Topics 里加上`)
  } else {
    result.notes.push(`已带 ${REQUIRED_TOPIC} topic`)
  }

  const branch = options.defaultBranch ?? data.default_branch ?? 'main'
  if (options.fetchText) {
    const raw = await options.fetchText(`https://raw.githubusercontent.com/${repo}/${branch}/package.json`)
    if (!raw.ok) {
      result.notes.push(`未能读取远端 package.json（默认分支 ${branch}），CI 会自行读取`)
    } else {
      let remotePackage = null
      try {
        remotePackage = JSON.parse(raw.text)
      } catch {
        remotePackage = null
      }
      if (remotePackage === null) {
        result.issues.push('远端 package.json 解析失败')
      } else if (typeof remotePackage.dsh?.bundle?.patch !== 'string') {
        result.issues.push('远端 package.json 没有 dsh.bundle.patch —— 请先把本地改动 push 到 GitHub')
      } else {
        result.notes.push(`远端 dsh.bundle.patch = ${remotePackage.dsh.bundle.patch}`)
      }
    }
  }

  return result
}
