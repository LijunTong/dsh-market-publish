/**
 * Resolve what the user typed — a GitHub address or a local plugin directory —
 * into a working copy the checks can read. GitHub addresses are cloned into a
 * temporary directory that the caller can clean up afterwards.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { parseGitHubRemote } from './repo.js'

export const CLONE_TIMEOUT_MS = 180000

const SHORT_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/**
 * @param {string} input
 * @returns {{ kind: 'github', repo: string } | { kind: 'local', dir: string }}
 */
export function parseInput(input) {
  const value = String(input ?? '').trim()
  if (value === '') throw new Error('请填写 GitHub 地址或本地插件目录')

  const repo = parseGitHubRemote(value) ?? (SHORT_REPO.test(value) ? value : null)
  if (repo !== null) return { kind: 'github', repo }

  const dir = resolve(value)
  if (existsSync(dir) && statSync(dir).isDirectory()) return { kind: 'local', dir }

  throw new Error(`无法识别：${value} —— 填 https://github.com/owner/repo，或一个存在的本地目录`)
}

/**
 * @param {string} repo
 * @param {{ exec?: (args: readonly string[], cwd: string) => string, timeoutMs?: number }} [options]
 * @returns {{ dir: string, root: string }}
 */
export function cloneRepository(repo, options = {}) {
  const timeout = options.timeoutMs ?? CLONE_TIMEOUT_MS
  const exec =
    options.exec ??
    ((args, cwd) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
        windowsHide: true,
      }))

  const root = mkdtempSync(join(tmpdir(), 'dsh-market-gui-'))
  const dir = join(root, repo.replace(/[^A-Za-z0-9_.-]+/g, '-'))
  try {
    exec(['clone', '--depth', '1', `https://github.com/${repo}.git`, dir], root)
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const detail = stderr === '' ? String(error?.message ?? error) : stderr.split('\n').slice(-3).join(' ')
    throw new Error(
      `克隆 ${repo} 失败：${detail}（需要能访问 github.com；公司网络请先设 HTTPS_PROXY，或把仓库 clone 到本地后改填本地目录）`,
    )
  }
  return { dir, root }
}

/**
 * @param {string} input
 * @param {{ exec?: (args: readonly string[], cwd: string) => string, timeoutMs?: number }} [options]
 * @returns {{ kind: 'github' | 'local', dir: string, repo: string | null, cleanup: () => void }}
 */
export function prepareWorkspace(input, options = {}) {
  const parsed = parseInput(input)
  if (parsed.kind === 'local') {
    return { kind: 'local', dir: parsed.dir, repo: null, cleanup: () => {} }
  }
  const { dir, root } = cloneRepository(parsed.repo, options)
  return {
    kind: 'github',
    dir,
    repo: parsed.repo,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
