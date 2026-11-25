import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { cloneRepository, parseInput, prepareWorkspace } from '../src/workspace.js'

test('a GitHub url becomes owner/name', () => {
  assert.deepEqual(parseInput('https://github.com/owner/plugin'), { kind: 'github', repo: 'owner/plugin' })
  assert.deepEqual(parseInput('https://github.com/owner/plugin.git'), { kind: 'github', repo: 'owner/plugin' })
  assert.deepEqual(parseInput('git@github.com:owner/plugin.git'), { kind: 'github', repo: 'owner/plugin' })
  assert.deepEqual(parseInput('owner/plugin'), { kind: 'github', repo: 'owner/plugin' })
})

test('an existing directory is used in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-ws-'))
  assert.deepEqual(parseInput(dir), { kind: 'local', dir })
})

test('anything else is rejected with a readable message', () => {
  assert.throws(() => parseInput('   '), /GitHub 地址/)
  assert.throws(() => parseInput('C:/definitely/not/here'), /无法识别/)
})

test('a GitHub address is cloned into a temporary directory', () => {
  /** @type {{ args: readonly string[], cwd: string }[]} */
  const calls = []
  const exec = (args, cwd) => {
    calls.push({ args, cwd })
    return ''
  }
  const { dir, root } = cloneRepository('owner/plugin', { exec })
  assert.equal(calls.length, 1)
  assert.deepEqual([...calls[0].args].slice(0, 4), ['clone', '--depth', '1', 'https://github.com/owner/plugin.git'])
  assert.equal(calls[0].args[4], dir)
  assert.ok(dir.startsWith(root))
  assert.equal(calls[0].cwd, root)
})

test('a failed clone cleans up and keeps the git error visible', () => {
  const exec = () => {
    throw Object.assign(new Error('boom'), { stderr: 'fatal: repository not found' })
  }
  assert.throws(() => cloneRepository('owner/missing', { exec }), /克隆 owner\/missing 失败.*repository not found/)
})

test('prepareWorkspace reports whether cleanup is needed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dmp-ws-'))
  const local = prepareWorkspace(dir)
  assert.equal(local.kind, 'local')
  assert.equal(local.repo, null)
  local.cleanup()

  const remote = prepareWorkspace('owner/plugin', { exec: () => '' })
  assert.equal(remote.kind, 'github')
  assert.equal(remote.repo, 'owner/plugin')
  remote.cleanup()
})
