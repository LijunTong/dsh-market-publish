/**
 * npm side of the GUI: inspect what would be published and publish it with a
 * token that only lives in the child process environment.
 */
import { execFile } from 'node:child_process'

export const REGISTRY = 'https://registry.npmjs.org'

const WINDOWS = process.platform === 'win32'

/**
 * @param {readonly string[]} args
 * @param {{ cwd: string, env?: Record<string, string>, timeoutMs?: number }} options
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runNpm(args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      WINDOWS ? 'npm.cmd' : 'npm',
      args,
      {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs ?? 120000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        shell: WINDOWS,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(Object.assign(error, { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }))
          return
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      },
    )
    child.on('error', reject)
  })
}

/**
 * What `npm publish` would upload, without touching the network.
 *
 * @param {string} dir
 * @returns {Promise<{ name: string, version: string, files: number, size: number }>}
 */
export async function inspectNpmPackage(dir) {
  let stdout
  try {
    ;({ stdout } = await runNpm(['pack', '--dry-run', '--json'], { cwd: dir, timeoutMs: 120000 }))
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim()
    throw new Error(`读取 npm 包信息失败：${stderr === '' ? String(error.message) : stderr.split('\n').slice(-3).join(' ')}`)
  }
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('npm pack 输出不是合法 JSON，无法确认包信息')
  }
  const pack = Array.isArray(parsed) ? parsed[0] : parsed
  const name = String(pack?.name ?? '')
  const version = String(pack?.version ?? '')
  if (name === '' || version === '') throw new Error('package.json 缺少 name 或 version，无法发布到 npm')
  return {
    name,
    version,
    files: Array.isArray(pack?.files) ? pack.files.length : 0,
    size: Number(pack?.size ?? 0),
  }
}

/**
 * @param {string} name
 * @param {string} version
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<boolean>}
 */
export async function versionExists(name, version, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const response = await fetchImpl(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`查询 npm registry 失败：${response.status}`)
  const data = await response.json()
  return typeof data?.versions?.[version] === 'object'
}

/**
 * @param {{
 *   dir: string,
 *   token?: string,
 *   access?: 'public' | 'restricted',
 *   dryRun?: boolean,
 *   registry?: string,
 * }} options
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function publishToNpm(options) {
  const args = ['publish', '--access', options.access ?? 'public']
  if (options.dryRun === true) args.push('--dry-run')
  const env = {}
  if (typeof options.token === 'string' && options.token !== '') {
    const host = (options.registry ?? REGISTRY).replace(/^https?:\/\//, '')
    env[`npm_config_//${host}/:_authToken`] = options.token
  }
  return runNpm(args, { cwd: options.dir, env, timeoutMs: 300000 })
}
