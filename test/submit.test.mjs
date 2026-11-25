import assert from 'node:assert/strict'
import test from 'node:test'

import { branchName, pullRequestBody, submitEntry } from '../src/submit.js'

/**
 * @param {Record<string, { status?: number, data?: any }>} routes
 */
function fakeClient(routes, token = 'token') {
  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown }} [init]
   */
  async function request(path, init = {}) {
    const bare = path.split('?')[0]
    const key = `${init.method ?? 'GET'} ${bare}`
    const route = routes[key] ?? routes[`${init.method ?? 'GET'} ${path}`]
    if (route === undefined) throw new Error(`unexpected request ${key}`)
    const status = route.status ?? 200
    return { status, ok: status >= 200 && status < 300, data: route.data ?? null }
  }
  return {
    token,
    request,
    async orThrow(path, init) {
      const result = await request(path, init)
      if (!result.ok) throw new Error(`${init && init.method ? init.method : 'GET'} ${path} -> ${result.status}`)
      return result.data
    },
  }
}

const happyRoutes = {
  'GET /user': { data: { login: 'me' } },
  'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/forks': { status: 202, data: {} },
  'GET /repos/me/awesome-dsh-plugin': { data: {} },
  'GET /repos/me/awesome-dsh-plugin/git/ref/heads/main': { data: { object: { sha: 'base-sha' } } },
  'GET /repos/me/awesome-dsh-plugin/git/ref/heads/add-a-b': { status: 404, data: {} },
  'POST /repos/me/awesome-dsh-plugin/git/refs': { status: 201, data: {} },
  'GET /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 404, data: {} },
  'PUT /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { status: 201, data: {} },
  'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls': { status: 201, data: { html_url: 'https://example.test/pr/1' } },
}

test('branchName is stable and URL safe', () => {
  assert.equal(branchName('a/b'), 'add-a-b')
  assert.equal(branchName('LijunTong/git-branch-tool'), 'add-lijuntong-git-branch-tool')
})

test('pullRequestBody lists what was checked', () => {
  const body = pullRequestBody({ repo: 'a/b', category: 'git', notes: ['dsh.bundle.patch = ./cordis.patch.yml'], entryPath: 'data/plugins/a__b.yml' })
  assert.ok(body.includes('Adds **a/b** under `git`.'))
  assert.ok(body.includes('- dsh.bundle.patch = ./cordis.patch.yml'))
  assert.ok(body.includes('data/plugins/a__b.yml'))
})

test('submitEntry forks, commits the entry and returns the PR url', async () => {
  const client = fakeClient(happyRoutes)
  const result = await submitEntry({
    client,
    repo: 'a/b',
    category: 'git',
    entry: 'url: https://github.com/a/b\n',
    entryPath: 'data/plugins/a__b.yml',
    notes: [],
    forkAttempts: 1,
    sleep: async () => {},
  })
  assert.equal(result.url, 'https://example.test/pr/1')
  assert.equal(result.branch, 'add-a-b')
  assert.equal(result.fork, 'me/awesome-dsh-plugin')
})

test('submitEntry reuses an existing branch and entry file', async () => {
  const client = fakeClient({
    ...happyRoutes,
    'GET /repos/me/awesome-dsh-plugin/git/ref/heads/add-a-b': { data: { object: { sha: 'branch-sha' } } },
    'GET /repos/me/awesome-dsh-plugin/contents/data/plugins/a__b.yml': { data: { sha: 'file-sha' } },
  })
  const result = await submitEntry({
    client,
    repo: 'a/b',
    category: 'git',
    entry: 'url: https://github.com/a/b\n',
    entryPath: 'data/plugins/a__b.yml',
    notes: [],
    forkAttempts: 1,
    sleep: async () => {},
  })
  assert.equal(result.branch, 'add-a-b')
})

test('submitEntry needs a token', async () => {
  const client = fakeClient(happyRoutes, '')
  await assert.rejects(
    submitEntry({ client, repo: 'a/b', category: 'git', entry: '', entryPath: 'x.yml', notes: [] }),
    /GITHUB_TOKEN/,
  )
})

test('submitEntry explains an already open pull request', async () => {
  const client = fakeClient({
    ...happyRoutes,
    'POST /repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls': { status: 422, data: { message: 'A pull request already exists' } },
  })
  await assert.rejects(
    submitEntry({
      client,
      repo: 'a/b',
      category: 'git',
      entry: '',
      entryPath: 'data/plugins/a__b.yml',
      notes: [],
      forkAttempts: 1,
      sleep: async () => {},
    }),
    /已有针对/,
  )
})
