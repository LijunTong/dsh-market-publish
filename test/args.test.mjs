import assert from 'node:assert/strict'
import test from 'node:test'

import { parseArgs } from '../src/args.js'

test('defaults: dry run, GitHub checks on, no target overrides', () => {
  const options = parseArgs([])
  assert.equal(options.apply, false)
  assert.equal(options.check, true)
  assert.equal(options.repo, undefined)
})

test('value options are read in any order', () => {
  const options = parseArgs(['--repo', 'a/b', '--category', 'git', '--en', 'Hi.', '--zh', '你好。', '--icon', 'https://x/y.png'])
  assert.equal(options.repo, 'a/b')
  assert.equal(options.category, 'git')
  assert.equal(options.en, 'Hi.')
  assert.equal(options.zh, '你好。')
  assert.equal(options.icon, 'https://x/y.png')
})

test('--no-check disables the GitHub side', () => {
  assert.equal(parseArgs(['--no-check']).check, false)
})

test('--apply and --json are booleans', () => {
  const options = parseArgs(['--apply', '--json'])
  assert.equal(options.apply, true)
  assert.equal(options.json, true)
})

test('--help wins over the rest of the line', () => {
  assert.equal(parseArgs(['--help']).help, true)
  assert.equal(parseArgs(['-h']).help, true)
})

test('unknown options and missing values are rejected', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown option/)
  assert.throws(() => parseArgs(['--repo']), /needs a value/)
  assert.throws(() => parseArgs(['positional']), /unexpected argument/)
})
