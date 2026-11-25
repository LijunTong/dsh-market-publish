#!/usr/bin/env node
/**
 * Launch the local GUI: one page that takes a GitHub address, checks the
 * plugin and pushes it to the DSH market and to npm.
 */
import { startServer } from '../src/server.js'

const port = Number(process.env.DSH_MARKET_PORT ?? 4780)
const host = process.env.DSH_MARKET_HOST ?? '127.0.0.1'

try {
  const running = await startServer({ port, host })
  process.stdout.write(`dsh-market-publish GUI → ${running.url}\n`)
  process.stdout.write('按 Ctrl+C 退出\n')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`启动失败：${message}\n`)
  if (String(message).includes('EADDRINUSE')) {
    process.stderr.write(`端口 ${port} 被占用，换一个：DSH_MARKET_PORT=4781 node bin/gui.mjs\n`)
  }
  process.exitCode = 1
}
