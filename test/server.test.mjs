import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { startServer } from '../src/server.js'

const PACKAGE = {
  name: 'demo',
  version: '1.0.0',
  description: 'Does things with branches.',
  keywords: ['dsh', 'git'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  files: ['cordis.patch.yml'],
}

const REPO_INFO = {
  created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  topics: ['dsh-plugin'],
  archived: false,
  private: false,
  default_branch: 'main',
}

/** @param {string} name */
function makePluginDir(name = 'demo') {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-gui-'))
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ ...PACKAGE, name }, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.patch.yml'), '')
  return dir
}

/** @param {number} status @param {any} data */
function reply(status, data) {
  const body = data === undefined ? '' : JSON.stringify(data)
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

/**
 * @param {Record<string, any>} pkg package.json served from raw.githubusercontent
 * @param {Record<string, { status: number, data?: any }>} [extra] extra "METHOD /path" routes
 */
function fakeGitHub(pkg, extra = {}) {
  return async (url, init = {}) => {
    const target = String(url)
    const method = String(init.method ?? 'GET')
    const path = target.replace('https://api.github.com', '').split('?')[0]
    const key = `${method} ${path}`
    if (extra[key] !== undefined) return reply(extra[key].status, extra[key].data)
    if (method === 'GET' && path === '/repos/a/b') return reply(200, REPO_INFO)
    if (target === 'https://raw.githubusercontent.com/a/b/main/package.json') return reply(200, pkg)
    return reply(404, { message: 'Not Found' })
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
async function boot(options = {}) {
  const running = await startServer({ port: 0, log: () => {}, ...options })
  return { url: running.url, close: running.close }
}

/**
 * @param {string} url
 * @param {string} path
 * @param {unknown} [body]
 */
async function post(url, path, body) {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return { status: response.status, data: await response.json() }
}

test('serves the page and the category list', async () => {
  const app = await boot()
  try {
    const page = await fetch(`${app.url}/`)
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes('DSH 插件投稿'))

    const categories = await fetch(`${app.url}/api/categories`).then((response) => response.json())
    assert.ok(categories.categories.includes('git'))
    assert.ok(categories.categories.includes('market'))
  } finally {
    await app.close()
  }
})

test('a clean check returns the entry and no issues', async () => {
  const dir = makePluginDir()
  const app = await boot({ fetchImpl: fakeGitHub(PACKAGE) })
  try {
    const { status, data } = await post(app.url, '/api/check', { input: dir, repo: 'a/b' })
    assert.equal(status, 200)
    assert.equal(data.ok, true, JSON.stringify(data.issues))
    assert.equal(data.repo, 'a/b')
    assert.equal(data.category, 'git')
    assert.equal(data.entryPath, 'data/plugins/a__b.yml')
    assert.ok(data.entry.includes('url: https://github.com/a/b'))
    assert.ok(data.notes.some((note) => note.includes('dsh-plugin')))
  } finally {
    await app.close()
  }
})

test('a broken package explains every failure with a fix hint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-gui-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', description: 'Awesome revolutionary thing', keywords: ['dsh', 'git'] }),
  )
  const remote = { ...PACKAGE, description: 'Awesome revolutionary thing' }
  delete remote.dsh
  const app = await boot({ fetchImpl: fakeGitHub(remote) })
  try {
    const { status, data } = await post(app.url, '/api/check', { input: dir, repo: 'a/b' })
    assert.equal(status, 200)
    assert.equal(data.ok, false)
    assert.ok(data.issues.length >= 2)
    for (const issue of data.issues) {
      assert.equal(typeof issue.message, 'string')
      assert.equal(typeof issue.hint, 'string')
      assert.ok(issue.hint.length > 0)
    }
    const missingBundle = data.issues.find((issue) => issue.message.includes('dsh.bundle.patch'))
    assert.ok(missingBundle !== undefined)
    assert.ok(missingBundle.hint.includes('cordis.patch.yml'))
  } finally {
    await app.close()
  }
})

test('an unknown address is a 400 with a message', async () => {
  const app = await boot()
  try {
    const { status, data } = await post(app.url, '/api/check', { input: 'C:/definitely/not/here' })
    assert.equal(status, 400)
    assert.equal(data.ok, false)
    assert.ok(data.message.includes('无法识别'))
  } finally {
    await app.close()
  }
})

test('opening the pull request commits the entry and returns the url', async () => {
  const dir = makePluginDir()
  const routes = {
    'GET /user': { status: 200, data: { login: 'me' } },
    'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/forks': { status: 202, data: {} },
    'GET /repos/me/awesome-dsh-plugin': { status: 200, data: {} },
    'GET /repos/me/awesome-dsh-plugin/git/ref/heads/main': { status: 200, data: { object: { sha: 'base-sha' } } },
    'GET /repos/me/awesome-dsh-plugin/git/ref/heads/add-a-b': { status: 404, data: { message: 'Not Found' } },
    'POST /repos/me/awesome-dsh-plugin/git/refs': { status: 201, data: {} },
    'GET /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 404, data: { message: 'Not Found' } },
    'PUT /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 201, data: {} },
    'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls': {
      status: 201,
      data: { html_url: 'https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7' },
    },
  }
  const app = await boot({ fetchImpl: fakeGitHub(PACKAGE, routes) })
  try {
    const { status, data } = await post(app.url, '/api/publish/market', { input: dir, repo: 'a/b', token: 'test-token' })
    assert.equal(status, 200, JSON.stringify(data))
    assert.equal(data.ok, true)
    assert.equal(data.url, 'https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7')
    assert.equal(data.branch, 'add-a-b')
  } finally {
    await app.close()
  }
})

test('npm publish refuses to run without an explicit confirmation', async () => {
  const dir = makePluginDir()
  const app = await boot()
  try {
    const { status, data } = await post(app.url, '/api/npm/publish', { input: dir })
    assert.equal(status, 400)
    assert.equal(data.ok, false)
    assert.ok(data.message.includes('确认'))
  } finally {
    await app.close()
  }
})
