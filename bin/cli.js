#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { RULES, REVIEWED, CONTEXTS, CHANNELS, applicableRules, checkConversation, parseConversation, formatCheck, formatRules } from '../src/index.js'
import { serve } from '../src/mcp.js'
import { VERSION } from '../src/version.js'

const USAGE = `
ai-disclosure rules --where <place> --channel <channel> [--context <fact>]...
ai-disclosure check <conversation|-> --where <place> --channel <channel> [options]
ai-disclosure mcp --where <place> --channel <channel> [options]
ai-disclosure contexts

  Which laws say your AI must tell people it is an AI, and did this conversation
  do it? ${RULES.length} rules across the US, EU, UK, Canada and Australia, each quoting
  the official text, last checked ${REVIEWED}.

Options
  --where <place>       Where the person is: US-CA, US-NY, EU, DE, UK, CA-QC, AU...
                        Repeatable, or comma-separated.
  --channel <channel>   ${CHANNELS.join(', ')}.
  --context <fact>      Facts that decide some rules: commerce, companion, minor,
                        health, marketing, outbound... Repeatable. See "contexts".
  --date <YYYY-MM-DD>   Judge by the law on this day. Default: the conversation's
                        first message, else today.
  --business <name>     Your business's name, for rules that require naming it.
  --persistent-notice   Your interface shows an AI notice throughout.
  --phrase <text>       Your own disclosure wording, if the checker misses it.
                        Repeatable.
  --strict              check: exit 1 on warn or incomplete too.
  --json                Machine-readable output.
  --no-colour           Plain text.
  --version, --help

Conversations
  JSON: a list of { role, text, at }, OpenAI or Anthropic messages, or
  { "messages": [...] }. Or a text transcript of "User: ..." and "AI: ..." lines.
  Roles: user, ai (or assistant), staff (a person on your side).

Exit codes
  0  check: pass, warn or incomplete. Otherwise: done.
  1  check: fail; with --strict, also warn or incomplete.
  2  could not run.

Examples
  npx @askeleven/ai-disclosure rules --where US-CA,EU --channel chat --context commerce
  npx @askeleven/ai-disclosure check chat.json --where US-NY --channel chat --context companion
`

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        where: { type: 'string', multiple: true },
        channel: { type: 'string' },
        context: { type: 'string', multiple: true },
        date: { type: 'string' },
        business: { type: 'string' },
        'persistent-notice': { type: 'boolean', default: false },
        phrase: { type: 'string', multiple: true },
        strict: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        // parseArgs has no --no-x negation, so both spellings are declared explicitly.
        'no-colour': { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    })
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n${USAGE}`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(USAGE)
    return 0
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  const [sub, ...args] = positionals
  if (sub === 'contexts') {
    if (values.json) process.stdout.write(`${JSON.stringify(CONTEXTS, null, 2)}\n`)
    else for (const [k, v] of Object.entries(CONTEXTS)) process.stdout.write(`${k.padEnd(22)}${v}\n`)
    return 0
  }
  if (!['rules', 'check', 'mcp'].includes(sub ?? '')) {
    process.stderr.write(`${sub ? `Unknown command: ${sub}\n` : ''}${USAGE}`)
    return 2
  }

  try {
    const where = list(values.where)
    if (where.length === 0) throw new UsageError('Give --where: where the person is, such as US-CA or EU.')
    const channel = (values.channel ?? '').toLowerCase()
    if (!CHANNELS.includes(channel)) throw new UsageError(`Give --channel: one of ${CHANNELS.join(', ')}.`)
    const context = list(values.context).map((c) => c.toLowerCase())
    const unknown = context.filter((c) => !(c in CONTEXTS))
    if (unknown.length) throw new UsageError(`Unknown context: ${unknown.join(', ')}. "ai-disclosure contexts" lists them.`)
    const colour = useColour(values)

    if (sub === 'mcp') {
      await serve({ where, channel, context, business: values.business, persistentNotice: values['persistent-notice'] })
      return 0
    }

    if (sub === 'rules') {
      const date = day(values.date) ?? new Date().toISOString().slice(0, 10)
      const situation = { jurisdictions: where, channel, context, date }
      const applicable = applicableRules(RULES, situation)
      process.stdout.write(values.json ? `${JSON.stringify(applicable, null, 2)}\n` : formatRules(applicable, situation, { colour, date }))
      return 0
    }

    if (args.length !== 1) throw new UsageError('check needs one conversation file, or - for standard input.')
    const raw = args[0] === '-' ? await readStdin() : await readFile(args[0], 'utf8')
    let conversation
    try {
      conversation = parseConversation(raw)
    } catch (error) {
      throw new UsageError(`Could not read the conversation: ${/** @type {Error} */ (error).message}`)
    }
    if (conversation.length === 0) throw new UsageError('The conversation has no messages from the user or the AI.')
    const first = conversation.find((t) => t.at !== undefined)?.at
    const date = day(values.date) ?? (first !== undefined ? new Date(first).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    const situation = { jurisdictions: where, channel, context, date }
    const result = checkConversation(RULES, situation, conversation, {
      business: values.business,
      persistentNotice: values['persistent-notice'],
      phrases: values.phrase,
    })
    process.stdout.write(values.json ? `${JSON.stringify({ date, ...result }, null, 2)}\n` : formatCheck(result, situation, { colour, date }))
    if (result.verdict === 'fail') return 1
    if (values.strict && result.verdict !== 'pass') return 1
    return 0
  } catch (error) {
    if (error instanceof UsageError || error instanceof TypeError) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    const code = /** @type {{ code?: string }} */ (error).code
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') {
      process.stderr.write(`${/** @type {Error} */ (error).message}\n`)
      return 2
    }
    throw error
  }
}

/**
 * @param {string[] | undefined} values
 * @returns {string[]}
 */
function list(values) {
  return (values ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
}

/**
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function day(value) {
  if (value === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new UsageError(`Could not read --date "${value}". Use YYYY-MM-DD.`)
  return value
}

/** @returns {Promise<string>} */
async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

class UsageError extends Error {}

/**
 * @param {Record<string, any>} values
 * @returns {boolean}
 */
function useColour(values) {
  if (values['no-colour'] || values['no-color']) return false
  if (process.env.NO_COLOR) return false
  return process.stdout.isTTY === true
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    process.stderr.write(`${error?.stack ?? error}\n`)
    process.exitCode = 2
  },
)
