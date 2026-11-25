/**
 * Zero-dependency HTTP server behind the GUI: static files plus three JSON
 * endpoints — check a plugin, open the market PR, publish to npm.
 *
 * Tokens arrive in the request body and are only kept in memory for the
 * duration of the request; nothing is written to disk or logged.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { inspect } from './cli.js'
import { CATEGORIES } from './categories.js'
import { createClient } from './github.js'
import { inspectNpmPackage, publishToNpm, versionExists } from './npm.js'
import { describeIssues } from './report.js'
import { submitEntry } from './submit.js'
import { prepareWorkspace } from './workspace.js'

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url))
const MAX_BODY = 1024 * 1024

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/style.css': 'style.css',
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new HttpError(413, '请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new HttpError(400, '请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Turn the address in the request into a workspace, reporting bad addresses as
 * a 400 instead of an internal error.
 *
 * @param {unknown} input
 */
function openWorkspace(input) {
  const value = String(input ?? '').trim()
  if (value === '') throw new HttpError(400, '请填写 GitHub 地址或本地目录')
  try {
    return prepareWorkspace(value)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error))
  }
}

/**
 * @param {Record<string, any>} fields
 */
async function runInspection(fields, deps = {}) {
  const workspace = openWorkspace(fields.input)
  try {
    const inspected = await inspect({
      dir: workspace.dir,
      repo: fields.repo ?? workspace.repo,
      category: fields.category,
      en: fields.en,
      zh: fields.zh,
      icon: fields.icon,
      tarball: fields.tarball,
      env: process.env,
      token: typeof fields.token === 'string' ? fields.token : undefined,
      fetchImpl: deps.fetchImpl,
    })

    if (inspected.stage !== 'done') {
      const stageHint = {
        package: '确认填的是插件仓库根目录（里面要有 package.json）',
        repo: '在「可选」里填 owner/name，或在插件目录执行 git remote add origin <GitHub 地址>',
        category: '在「分类」下拉里选一个；留空时 package.json 的 keywords 要能对上分类名',
      }[inspected.stage]
      return {
        inspected,
        view: {
          ok: false,
          stage: inspected.stage,
          repo: workspace.repo,
          category: null,
          issues: describeIssues([inspected.message]).map((issue) =>
            stageHint === undefined ? issue : { ...issue, hint: stageHint },
          ),
          notes: [],
          entry: '',
          entryPath: '',
          package: null,
        },
      }
    }

    return {
      inspected,
      view: {
        ok: inspected.issues.length === 0,
        stage: 'done',
        kind: workspace.kind,
        repo: inspected.repo,
        category: inspected.category,
        entry: inspected.entry,
        entryPath: inspected.entryPath,
        package: { name: inspected.pkg.name, version: inspected.pkg.version },
        issues: describeIssues(inspected.issues),
        notes: inspected.notes,
      },
    }
  } finally {
    workspace.cleanup()
  }
}

/**
 * @param {Record<string, any>} fields
 * @returns {Promise<{ status: number, payload: any }>}
 */
async function publishMarket(fields, deps = {}) {
  const { view, inspected } = await runInspection(fields, deps)
  if (view.stage !== 'done') return { status: 400, payload: view }
  if (!view.ok) return { status: 400, payload: view }

  const given = typeof fields.token === 'string' ? fields.token.trim() : ''
  const token = given === '' ? inspected.token : given
  if (token === '') {
    return {
      status: 400,
      payload: {
        ...view,
        issues: describeIssues([
          '需要 GitHub token：填一个带 public_repo 权限的 token，或在本机 gh auth login 后留空',
        ]),
      },
    }
  }

  const client = createClient({ token, fetchImpl: deps.fetchImpl })
  const submission = await submitEntry({
    client,
    repo: inspected.repo,
    category: inspected.category,
    entry: inspected.entry,
    entryPath: inspected.entryPath,
    notes: inspected.notes,
  })

  return {
    status: 200,
    payload: {
      ok: true,
      repo: inspected.repo,
      url: submission.url,
      branch: submission.branch,
      fork: submission.fork,
      entryPath: inspected.entryPath,
    },
  }
}

/**
 * @param {Record<string, any>} fields
 */
async function npmPreview(fields, deps = {}) {
  const workspace = openWorkspace(fields.input)
  try {
    const info = await inspectNpmPackage(workspace.dir)
    const published = await versionExists(info.name, info.version, { fetchImpl: deps.fetchImpl })
    return { ok: true, repo: workspace.repo, ...info, published }
  } finally {
    workspace.cleanup()
  }
}

/**
 * @param {Record<string, any>} fields
 * @returns {Promise<{ status: number, payload: any }>}
 */
async function npmPublish(fields, deps = {}) {
  if (fields.confirm !== true) {
    return { status: 400, payload: { ok: false, message: '发布前需要确认（confirm: true）' } }
  }
  const workspace = openWorkspace(fields.input)
  try {
    const info = await inspectNpmPackage(workspace.dir)
    if (await versionExists(info.name, info.version, { fetchImpl: deps.fetchImpl })) {
      return {
        status: 409,
        payload: { ok: false, ...info, message: `${info.name}@${info.version} 已经发布过，先改版本号再发布` },
      }
    }
    const result = await publishToNpm({
      dir: workspace.dir,
      token: typeof fields.token === 'string' && fields.token.trim() !== '' ? fields.token.trim() : undefined,
      access: fields.access === 'restricted' ? 'restricted' : 'public',
    })
    const tail = result.stdout.trim().split(/\r?\n/).slice(-5).join('\n')
    return { status: 200, payload: { ok: true, ...info, message: `已发布 ${info.name}@${info.version}`, output: tail } }
  } finally {
    workspace.cleanup()
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function route(req, res, deps) {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (url.pathname === '/api/categories') {
      sendJson(res, 200, { ok: true, categories: CATEGORIES })
      return
    }
    const name = STATIC[url.pathname]
    if (name === undefined) {
      sendJson(res, 404, { ok: false, message: `找不到 ${url.pathname}` })
      return
    }
    const body = await readFile(join(PUBLIC_DIR, name))
    res.writeHead(200, {
      'content-type': MIME[extname(name)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: '只支持 GET 与 POST' })
    return
  }

  const body = await readJson(req)
  if (url.pathname === '/api/check') {
    const { view } = await runInspection(body, deps)
    sendJson(res, 200, view)
    return
  }
  if (url.pathname === '/api/publish/market') {
    const { status, payload } = await publishMarket(body, deps)
    sendJson(res, status, payload)
    return
  }
  if (url.pathname === '/api/npm/preview') {
    sendJson(res, 200, await npmPreview(body, deps))
    return
  }
  if (url.pathname === '/api/npm/publish') {
    const { status, payload } = await npmPublish(body, deps)
    sendJson(res, status, payload)
    return
  }
  sendJson(res, 404, { ok: false, message: `没有这个接口：${url.pathname}` })
}

/**
 * @param {{ port?: number, host?: string, log?: (line: string) => void, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ server: import('node:http').Server, url: string, port: number, close: () => Promise<void> }>}
 */
export function startServer(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const log = options.log ?? ((line) => process.stdout.write(`${line}\n`))

  const deps = { fetchImpl: options.fetchImpl }
  const server = createServer((req, res) => {
    route(req, res, deps).catch((error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error ? error.message : String(error)
      if (status >= 500) log(`${req.method} ${req.url} → ${status} ${message}`)
      sendJson(res, status, { ok: false, message })
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? 0)
      resolve({
        server,
        port,
        url: `http://${host}:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
