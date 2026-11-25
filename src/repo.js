/**
 * Repository helpers: read package.json, resolve the GitHub repository name
 * from the git remote.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * @param {string} cwd
 * @returns {any}
 */
export function readPackage(cwd) {
  const path = join(cwd, 'package.json')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`找不到 ${path} —— 请在插件仓库根目录运行，或用 --dir 指定`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${path} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Turn a GitHub remote URL into `owner/name`.
 * Understands https, ssh (git@github.com:owner/name.git) and ssh:// forms.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function parseGitHubRemote(url) {
  const trimmed = url.trim()
  const patterns = [
    /^https?:\/\/[^/]*github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^(?:ssh:\/\/)?[^@/]*@?github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^git:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed)
    if (match) return `${match[1]}/${match[2]}`
  }
  return null
}

/**
 * @param {{ cwd: string, exec?: (args: readonly string[]) => string }} options
 * @returns {string | null}
 */
export function detectRemoteRepo(options) {
  const exec = options.exec ?? defaultExec(options.cwd)
  try {
    return parseGitHubRemote(exec(['remote', 'get-url', 'origin']))
  } catch {
    return null
  }
}

/**
 * @param {string} cwd
 */
export function defaultExec(cwd) {
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * Read the token from an authenticated `gh` CLI, if there is one.
 *
 * @param {string} cwd
 * @returns {() => string | null}
 */
export function ghTokenReader(cwd) {
  return () => {
    const out = execFileSync('gh', ['auth', 'token'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.trim() === '' ? null : out
  }
}
