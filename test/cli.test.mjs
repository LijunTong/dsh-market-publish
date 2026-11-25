import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { main } from '../src/cli.js'

/** @param {Record<string, string>} files */
function makePluginDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-cli-'))
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return dir
}

const PACKAGE = JSON.stringify(
  {
    name: 'demo',
    version: '1.0.0',
    description: 'Does things with branches.',
    keywords: ['dsh', 'git'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    files: ['cordis.patch.yml'],
  },
  null,
  2,
)

const REPO_INFO = {
  created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  topics: ['dsh-plugin'],
  archived: false,
  private: false,
  default_branch: 'main',
}

/**
 * @param {Record<string, { status?: number, data?: any }>} routes keyed by "METHOD /path"
 */
function fakeFetch(routes) {
  return async (url, init = {}) => {
    const method = String(init.method ?? 'GET')
    const path = String(url).replace('https://api.github.com', '')
    const key = `${method} ${path.split('?')[0]}`
    const route = routes[key] ?? routes[`${method} ${path}`]
    if (route === undefined) throw new Error(`unexpected request ${key}`)
    const status = route.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (route.data === undefined ? '' : JSON.stringify(route.data)),
    }
  }
}

/** @param {Partial<Parameters<typeof main>[0]> & { argv: readonly string[], dir: string }} overrides */
function baseIo(overrides) {
  /** @type {string[]} */
  const out = []
  /** @type {string[]} */
  const err = []
  return {
    io: {
      cwd: overrides.dir,
      env: {},
      exec: () => 'https://github.com/a/b.git',
      readGhToken: () => null,
      fetchText: async () => ({ ok: true, text: PACKAGE }),
      sleep: async () => {},
      forkAttempts: 1,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ...overrides,
    },
    out,
    err,
  }
}

test('--help prints the usage and exits 0', async () => {
  const { io, out } = baseIo({ argv: ['--help'], dir: process.cwd() })
  assert.equal(await main(io), 0)
  assert.ok(out.join('\n').includes('dsh-market-publish'))
})

test('bad usage exits 2 with a message', async () => {
  const { io, err } = baseIo({ argv: ['--nope'], dir: process.cwd() })
  assert.equal(await main(io), 2)
  assert.ok(err.join('\n').includes('unknown option'))
})

test('a missing category exits 2 and lists the choices', async () => {
  const pkg = JSON.parse(PACKAGE)
  delete pkg.keywords
  const dir = makePluginDir({ 'package.json': JSON.stringify(pkg), 'cordis.patch.yml': '' })
  const { io, err } = baseIo({ argv: ['--no-check'], dir })
  assert.equal(await main(io), 2)
  assert.ok(err.join('\n').includes('--category'))
})

test('a clean dry run writes the entry and exits 0', async () => {
  const dir = makePluginDir({ 'package.json': PACKAGE, 'cordis.patch.yml': '' })
  const outFile = join(dir, 'market', 'a__b.yml')
  const { io, out } = baseIo({ argv: ['--no-check', '--out', outFile], dir })
  assert.equal(await main(io), 0)
  const entry = readFileSync(outFile, 'utf8')
  assert.ok(entry.includes('url: https://github.com/a/b'))
  assert.ok(entry.includes('category: git'))
  assert.ok(out.join('\n').includes('检查通过'))
})

test('GitHub problems exit 1 and are listed', async () => {
  const dir = makePluginDir({ 'package.json': PACKAGE, 'cordis.patch.yml': '' })
  const { io, out } = baseIo({
    argv: [],
    dir,
    fetchImpl: fakeFetch({ 'GET /repos/a/b': { data: { ...REPO_INFO, topics: [] } } }),
  })
  assert.equal(await main(io), 1)
  assert.ok(out.join('\n').includes('topic'))
})

test('--json prints one machine readable object', async () => {
  const dir = makePluginDir({ 'package.json': PACKAGE, 'cordis.patch.yml': '' })
  const outFile = join(dir, 'entry.yml')
  const { io, out } = baseIo({ argv: ['--no-check', '--out', outFile, '--json'], dir })
  assert.equal(await main(io), 0)
  const payload = JSON.parse(out.join('\n'))
  assert.equal(payload.ok, true)
  assert.equal(payload.repo, 'a/b')
  assert.equal(payload.category, 'git')
  assert.equal(payload.entryPath, 'data/plugins/a__b.yml')
})

test('--apply opens the pull request and prints its URL', async () => {
  const dir = makePluginDir({ 'package.json': PACKAGE, 'cordis.patch.yml': '' })
  const { io, out } = baseIo({
    argv: ['--no-check', '--apply'],
    dir,
    env: { GITHUB_TOKEN: 'token' },
    fetchImpl: fakeFetch({
      'GET /user': { data: { login: 'me' } },
      'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/forks': { status: 202, data: {} },
      'GET /repos/me/awesome-dsh-plugin': { data: { name: 'awesome-dsh-plugin' } },
      'GET /repos/me/awesome-dsh-plugin/git/ref/heads/main': { data: { object: { sha: 'base-sha' } } },
      'GET /repos/me/awesome-dsh-plugin/git/ref/heads/add-a-b': { status: 404, data: { message: 'Not Found' } },
      'POST /repos/me/awesome-dsh-plugin/git/refs': { status: 201, data: {} },
      'GET /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 404, data: { message: 'Not Found' } },
      'PUT /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 201, data: {} },
      'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls': { status: 201, data: { html_url: 'https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1' } },
    }),
  })
  assert.equal(await main(io), 0)
  assert.ok(out.join('\n').includes('pull/1'))
})

test('--apply without a token fails with a clear message', async () => {
  const dir = makePluginDir({ 'package.json': PACKAGE, 'cordis.patch.yml': '' })
  const { io, err } = baseIo({ argv: ['--no-check', '--apply'], dir, env: {} })
  assert.equal(await main(io), 1)
  assert.ok(err.join('\n').includes('GITHUB_TOKEN'))
})
