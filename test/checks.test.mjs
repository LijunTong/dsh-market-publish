import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { checkDescriptions, checkIcon, checkPackage, checkRepository } from '../src/checks.js'

/** @param {Record<string, string>} files */
function makePackageDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-checks-'))
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return dir
}

const goodPackage = {
  name: 'demo',
  version: '1.0.0',
  description: 'Does things.',
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  files: ['cordis.patch.yml'],
}

test('checkPackage accepts a plugin that declares dsh.bundle.patch', () => {
  const dir = makePackageDir({ 'cordis.patch.yml': '- insert: []\n' })
  const result = checkPackage({ dir, pkg: goodPackage })
  assert.deepEqual(result.issues, [])
  assert.ok(result.notes.some((note) => note.includes('dsh.bundle.patch')))
})

test('checkPackage flags a missing patch declaration and a missing file', () => {
  const dir = makePackageDir({})
  const missingDeclaration = checkPackage({ dir, pkg: { name: 'x', version: '1.0.0' } })
  assert.ok(missingDeclaration.issues.some((issue) => issue.includes('dsh.bundle.patch')))

  const missingFile = checkPackage({ dir, pkg: goodPackage })
  assert.ok(missingFile.issues.some((issue) => issue.includes('不存在')))
})

test('checkPackage flags a missing version and notes the client half', () => {
  const dir = makePackageDir({ 'cordis.patch.yml': '' })
  const result = checkPackage({ dir, pkg: { ...goodPackage, version: '', dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } } })
  assert.ok(result.issues.some((issue) => issue.includes('version')))
  assert.ok(result.notes.some((note) => note.includes('web')))
})

test('checkDescriptions requires a sentence in both languages', () => {
  assert.deepEqual(checkDescriptions({ en: 'Switches branches.' }), [])
  assert.ok(checkDescriptions({ en: 'Switches branches' }).some((issue) => issue.includes('句号')))
  assert.ok(checkDescriptions({ en: 'Switches branches.', zh: '切换分支' }).some((issue) => issue.includes('中文')))
  assert.ok(checkDescriptions({ en: '' }).some((issue) => issue.includes('缺少英文描述')))
})

test('checkDescriptions rejects marketing words', () => {
  assert.ok(checkDescriptions({ en: 'The most powerful branch switcher.' }).some((issue) => issue.includes('营销')))
})

test('checkIcon only accepts raster images hosted on GitHub', () => {
  assert.deepEqual(checkIcon(undefined), [])
  assert.deepEqual(checkIcon('https://raw.githubusercontent.com/a/b/main/icon.png'), [])
  assert.ok(checkIcon('https://raw.githubusercontent.com/a/b/main/icon.svg').some((issue) => issue.includes('SVG')))
  assert.ok(checkIcon('https://example.com/icon.png').some((issue) => issue.includes('GitHub')))
  assert.ok(checkIcon('https://github.com/a/b/blob/main/icon.txt').some((issue) => issue.includes('格式')))
})

/**
 * @param {(path: string) => any} handler
 */
function fakeClient(handler) {
  return {
    token: '',
    async request(path) {
      return handler(path)
    },
  }
}

test('checkRepository reports a repository that does not exist yet', async () => {
  const client = fakeClient(() => ({ status: 404, ok: false, data: { message: 'Not Found' } }))
  const result = await checkRepository({ client, repo: 'a/b' })
  assert.ok(result.issues.some((issue) => issue.includes('找不到')))
})

test('checkRepository flags age, topics, visibility and archive state', async () => {
  const client = fakeClient(() => ({
    status: 200,
    ok: true,
    data: {
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      topics: [],
      archived: true,
      private: true,
      default_branch: 'main',
    },
  }))
  const result = await checkRepository({ client, repo: 'a/b' })
  assert.ok(result.issues.some((issue) => issue.includes('不满')))
  assert.ok(result.issues.some((issue) => issue.includes('topic')))
  assert.ok(result.issues.some((issue) => issue.includes('归档')))
  assert.ok(result.issues.some((issue) => issue.includes('私有')))
})

test('checkRepository reads the published package.json', async () => {
  const client = fakeClient(() => ({
    status: 200,
    ok: true,
    data: {
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      topics: ['dsh-plugin'],
      archived: false,
      private: false,
      default_branch: 'master',
    },
  }))
  const ok = await checkRepository({
    client,
    repo: 'a/b',
    fetchText: async () => ({ ok: true, text: JSON.stringify(goodPackage) }),
  })
  assert.deepEqual(ok.issues, [])

  const stale = await checkRepository({
    client,
    repo: 'a/b',
    fetchText: async () => ({ ok: true, text: JSON.stringify({ name: 'demo', version: '1.0.0' }) }),
  })
  assert.ok(stale.issues.some((issue) => issue.includes('push')))

  const unreadable = await checkRepository({
    client,
    repo: 'a/b',
    fetchText: async () => ({ ok: false, text: '' }),
  })
  assert.deepEqual(unreadable.issues, [])
  assert.ok(unreadable.notes.some((note) => note.includes('未能读取')))
})
