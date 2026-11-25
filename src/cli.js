/**
 * Command orchestration: read the package, run the checks, write the entry and
 * optionally open the pull request.
 *
 * Everything the outside world provides (argv, cwd, env, stdout, fetch, git) is
 * injected so the flow stays testable without a network or a real terminal.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { parseArgs, USAGE } from './args.js'
import { CATEGORIES } from './categories.js'
import { resolveCategory } from './categories.js'
import { checkDescriptions, checkIcon, checkPackage, checkRepository } from './checks.js'
import { buildEntry, ENTRY_DIR, entryFileName } from './entry.js'
import { createClient, resolveToken } from './github.js'
import { defaultExec, detectRemoteRepo, ghTokenReader, readPackage } from './repo.js'
import { submitEntry } from './submit.js'

/**
 * @typedef {object} CliIo
 * @property {readonly string[]} argv
 * @property {string} cwd
 * @property {Record<string, string | undefined>} env
 * @property {(line: string) => void} out
 * @property {(line: string) => void} err
 * @property {typeof fetch} [fetchImpl]
 * @property {() => string | null} [readGhToken]
 * @property {(args: readonly string[]) => string} [exec]
 * @property {(url: string) => Promise<{ ok: boolean, text: string }>} [fetchText]
 * @property {(message: string) => Promise<void>} [sleep]
 * @property {number} [forkAttempts]
 * @property {number} [forkWaitMs]
 */

/**
 * @param {CliIo} io
 * @returns {Promise<number>} exit code
 */
/**
 * Run every local and GitHub-side check and build the listing entry. The CLI
 * and the GUI share this so both report the same issues in the same words.
 *
 * @param {{
 *   dir: string,
 *   repo?: string | null,
 *   category?: string,
 *   en?: string,
 *   zh?: string,
 *   icon?: string,
 *   tarball?: string,
 *   env?: Record<string, string | undefined>,
 *   token?: string,
 *   readGhToken?: () => string | null,
 *   fetchImpl?: typeof fetch,
 *   fetchText?: (url: string) => Promise<{ ok: boolean, text: string }>,
 *   exec?: (args: readonly string[]) => string,
 *   check?: boolean,
 * }} options
 * @returns {Promise<
 *   | { stage: 'package', message: string }
 *   | { stage: 'repo', message: string }
 *   | { stage: 'category', message: string }
 *   | { stage: 'done', pkg: any, repo: string, category: string, en: string, zh?: string, issues: string[], notes: string[], entry: string, entryPath: string, token: string }
 * >}
 */
export async function inspect(options) {
  let pkg
  try {
    pkg = readPackage(options.dir)
  } catch (error) {
    return { stage: 'package', message: error instanceof Error ? error.message : String(error) }
  }

  const exec = options.exec ?? defaultExec(options.dir)
  const repo = options.repo ?? detectRemoteRepo({ cwd: options.dir, exec })
  if (repo === null || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    return {
      stage: 'repo',
      message: '无法确定目标仓库：用 --repo owner/name 指定，或先 git remote add origin <GitHub 地址>',
    }
  }

  const category = resolveCategory(options.category, pkg.keywords)
  if (category === null) {
    return {
      stage: 'category',
      message: `分类无效或缺失：可选 ${CATEGORIES.join(' ')}（命令行用 --category 指定，界面从下拉框选）`,
    }
  }

  const en = String(options.en ?? pkg.description ?? '')
  const zh = options.zh
  const local = checkPackage({ dir: options.dir, pkg })
  const issues = [...local.issues, ...checkDescriptions({ en, zh }), ...checkIcon(options.icon)]
  const notes = [...local.notes]

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const token =
    typeof options.token === 'string' && options.token !== ''
      ? options.token
      : resolveToken({ env: options.env, readGhToken: options.readGhToken ?? ghTokenReader(options.dir) })

  if (options.check === false) {
    notes.push('跳过 GitHub 侧检查（--no-check）')
  } else {
    const client = createClient({ token, fetchImpl })
    const fetchText =
      options.fetchText ??
      (async (url) => {
        const response = await fetchImpl(url)
        return { ok: response.ok, text: await response.text() }
      })
    const remote = await checkRepository({ client, repo, fetchText })
    issues.push(...remote.issues)
    notes.push(...remote.notes)
  }

  const entry = buildEntry({ repo, category, en, zh, icon: options.icon, tarball: options.tarball })
  const entryPath = `${ENTRY_DIR}/${entryFileName(repo)}`

  return { stage: 'done', pkg, repo, category, en, zh, issues, notes, entry, entryPath, token }
}

export async function main(io) {
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`))
  const err = io.err ?? ((line) => process.stderr.write(`${line}\n`))

  let options
  try {
    options = parseArgs(io.argv)
  } catch (error) {
    err(`参数错误：${error instanceof Error ? error.message : String(error)}`)
    err(USAGE)
    return 2
  }
  if (options.help) {
    out(USAGE)
    return 0
  }

  const dir = options.dir === undefined ? io.cwd : resolve(io.cwd, options.dir)
  const inspected = await inspect({
    dir,
    repo: options.repo,
    category: options.category,
    en: options.en,
    zh: options.zh,
    icon: options.icon,
    tarball: options.tarball,
    env: io.env,
    readGhToken: io.readGhToken,
    fetchImpl: io.fetchImpl,
    fetchText: io.fetchText,
    exec: io.exec,
    check: options.check,
  })
  if (inspected.stage !== 'done') {
    err(inspected.message)
    return 2
  }
  const { pkg, repo, category, entry, entryPath, issues, notes } = inspected
  const client = createClient({ token: inspected.token, fetchImpl: io.fetchImpl ?? globalThis.fetch })

  /** @type {any} */
  const result = {
    ok: false,
    repo,
    category,
    package: { name: pkg.name, version: pkg.version },
    entryPath,
    entry,
    issues,
    notes,
    writtenTo: null,
    pullRequest: null,
  }

  if (options.json !== true) {
    out(`仓库      ${repo}`)
    out(`分类      ${category}`)
    out(`版本      ${pkg.name}@${pkg.version}`)
    out(`条目文件  ${entryPath}`)
    for (const note of notes) out(`· ${note}`)
    out('')
    out('--- 条目内容 ---')
    out(entry.trimEnd())
  }

  if (issues.length > 0) {
    result.ok = false
    if (options.json === true) out(JSON.stringify(result, null, 2))
    else {
      out('')
      out('--- 还差这些 ---')
      for (const issue of issues) out(`✗ ${issue}`)
      out('')
      out('先修好再提交；上面这些问题 CI 或维护者都会打回。')
    }
    return 1
  }

  if (options.apply !== true) {
    const target = options.out ?? join(tmpdir(), 'dsh-market-publish', entryFileName(repo))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entry, 'utf8')
    result.ok = true
    result.writtenTo = target
    if (options.json === true) out(JSON.stringify(result, null, 2))
    else {
      out('')
      out(`已写入 ${target}`)
      out('检查通过。真正投稿（fork + commit + PR）：')
      out('  dsh-market-publish --apply')
    }
    return 0
  }

  try {
    const submission = await submitEntry({
      client,
      repo,
      category,
      entry,
      entryPath,
      notes,
      log: (line) => {
        if (options.json !== true) out(line)
      },
      sleep: io.sleep,
      forkAttempts: io.forkAttempts,
      forkWaitMs: io.forkWaitMs,
    })
    result.ok = true
    result.pullRequest = submission.url
    if (options.json === true) out(JSON.stringify(result, null, 2))
    else out(`\nPR 已创建：${submission.url}`)
    return 0
  } catch (error) {
    err(`失败：${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
