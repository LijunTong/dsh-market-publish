import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCategory } from '../src/categories.js'
import { buildEntry, entryFileName, yamlString } from '../src/entry.js'
import { parseGitHubRemote } from '../src/repo.js'

test('yamlString single-quotes and doubles inner quotes', () => {
  assert.equal(yamlString("it's"), "'it''s'")
  assert.equal(yamlString('切换分支。'), "'切换分支。'")
})

test('entryFileName turns owner/name into owner__name.yml', () => {
  assert.equal(entryFileName('LijunTong/git-branch-tool'), 'LijunTong__git-branch-tool.yml')
})

test('buildEntry writes url, name, category and both descriptions', () => {
  const entry = buildEntry({
    repo: 'a/b',
    category: 'git',
    en: 'Switch branches.',
    zh: '切换分支。',
  })
  assert.equal(
    entry,
    ["url: https://github.com/a/b", 'name: a/b', 'category: git', 'description:', "  en: 'Switch branches.'", "  zh: '切换分支。'", ''].join('\n'),
  )
})

test('buildEntry leaves out the optional fields it did not get', () => {
  const entry = buildEntry({ repo: 'a/b', category: 'dev', en: 'Does things.' })
  assert.ok(!entry.includes('zh:'))
  assert.ok(!entry.includes('icon:'))
  assert.ok(!entry.includes('tarball:'))
  assert.ok(entry.endsWith('\n'))
})

test('buildEntry keeps icon and tarball when given', () => {
  const entry = buildEntry({
    repo: 'a/b',
    category: 'dev',
    en: 'Does things.',
    icon: 'https://raw.githubusercontent.com/a/b/main/icon.png',
    tarball: 'https://github.com/a/b/releases/latest/download/b.tgz',
  })
  assert.ok(entry.includes("icon: 'https://raw.githubusercontent.com/a/b/main/icon.png'"))
  assert.ok(entry.includes("tarball: 'https://github.com/a/b/releases/latest/download/b.tgz'"))
})

test('parseGitHubRemote understands the usual remote spellings', () => {
  const cases = [
    ['https://github.com/a/b.git', 'a/b'],
    ['https://github.com/a/b', 'a/b'],
    ['git@github.com:a/b.git', 'a/b'],
    ['ssh://git@github.com/a/b.git', 'a/b'],
    ['git://github.com/a/b.git', 'a/b'],
  ]
  for (const [url, expected] of cases) assert.equal(parseGitHubRemote(/** @type {string} */ (url)), expected, url)
})

test('parseGitHubRemote rejects non-GitHub remotes', () => {
  assert.equal(parseGitHubRemote('https://gitlab.com/a/b.git'), null)
  assert.equal(parseGitHubRemote('/tmp/local.git'), null)
})

test('resolveCategory prefers the flag, then package keywords', () => {
  assert.equal(resolveCategory('git', ['ui']), 'git')
  assert.equal(resolveCategory(undefined, ['dsh', 'git']), 'git')
  assert.equal(resolveCategory(undefined, ['dsh']), null)
  assert.equal(resolveCategory(undefined, undefined), null)
  assert.equal(resolveCategory('nope', ['git']), null)
})
