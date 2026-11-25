#!/usr/bin/env node
import { main } from '../src/cli.js'

const code = await main({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
})

process.exitCode = code
