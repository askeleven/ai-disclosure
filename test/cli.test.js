import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = new URL('../bin/cli.js', import.meta.url).pathname

/** @param {string[]} args @param {string} [input] */
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input, env: { ...process.env, NO_COLOR: '1' } })

test('check: exit 1 on fail, 0 on pass, reads standard input and text transcripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-disclosure-'))
  try {
    const file = join(dir, 'chat.json')
    writeFileSync(file, JSON.stringify([{ role: 'user', content: 'are you a bot?' }, { role: 'assistant', content: 'No, I am a real person.' }]))
    const fail = run(['check', file, '--where', 'US-UT', '--channel', 'chat', '--context', 'commerce', '--date', '2026-10-17'])
    assert.equal(fail.status, 1, fail.stderr)
    assert.match(fail.stdout, /^FAIL/)
    assert.match(fail.stdout, /Claimed to be human/)

    const pass = run(['check', '-', '--where', 'US-UT', '--channel', 'chat', '--context', 'commerce', '--date', '2026-10-17'], 'User: are you a bot?\nAI: Yes, I am an AI assistant.\n')
    assert.equal(pass.status, 0, pass.stderr)
    assert.match(pass.stdout, /^PASS/)

    const json = run(['check', file, '--where', 'US-UT', '--channel', 'chat', '--context', 'commerce', '--date', '2026-10-17', '--json'])
    assert.equal(JSON.parse(json.stdout).verdict, 'fail')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rules lists what applies; bad input exits 2', () => {
  const r = run(['rules', '--where', 'US-CA,EU', '--channel', 'chat', '--context', 'commerce', '--date', '2026-10-17'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Bot disclosure \(B\.O\.T\. Act, SB 1001\)/)
  assert.match(r.stdout, /AI Act: tell people they are interacting with an AI system/)
  assert.equal(run(['rules', '--channel', 'chat']).status, 2)
  assert.match(run(['rules', '--where', 'EU', '--channel', 'fax']).stderr, /--channel/)
  assert.match(run(['rules', '--where', 'EU', '--channel', 'chat', '--context', 'vibes']).stderr, /Unknown context: vibes/)
  assert.equal(run(['check', '/nonexistent.json', '--where', 'EU', '--channel', 'chat']).status, 2)
})

test('MCP server: initialize, list tools, and disclosure_due', async () => {
  const child = spawn(process.execPath, [CLI, 'mcp', '--where', 'US-NY', '--channel', 'chat', '--context', 'companion'])
  /** @type {any[]} */
  const replies = []
  let buffer = ''
  child.stdout.on('data', (d) => {
    buffer += d
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      replies.push(JSON.parse(buffer.slice(0, i)))
      buffer = buffer.slice(i + 1)
    }
  })
  const send = (/** @type {object} */ m) => child.stdin.write(`${JSON.stringify(m)}\n`)
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'disclosure_due', arguments: { conversation: [{ role: 'user', text: 'hi' }] } } })
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'disclosure_due', arguments: { conversation: 'nope' } } })
  child.stdin.end()
  await new Promise((resolve) => child.on('close', resolve))
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]))
  assert.equal(byId[1].result.protocolVersion, '2025-06-18')
  assert.deepEqual(byId[2].result.tools.map((/** @type {any} */ t) => t.name), ['disclosure_due', 'disclosure_rules', 'check_conversation'])
  assert.equal(byId[3].result.structuredContent.disclose_now, true)
  assert.ok(byId[3].result.structuredContent.reasons.some((/** @type {any} */ r) => r.rule === 'us-ny-gbl-1702'))
  assert.equal(byId[4].result.isError, true)
})
