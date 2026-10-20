import { createInterface } from 'node:readline'
import { RULES, CONTEXTS, CHANNELS } from './rules.js'
import { applicableRules, checkConversation } from './check.js'
import { disclosureDue } from './due.js'
import { parseConversation } from './conversation.js'
import { dutyWords } from './report.js'
import { VERSION } from './version.js'

/**
 * A Model Context Protocol server over stdio, written against the spec directly so the
 * package keeps zero runtime dependencies. Messages are newline-delimited JSON-RPC 2.0.
 *
 * The situation (where the people are, the channel, the contexts) is set when the server
 * starts, by whoever deploys the agent. An agent can narrow it per call, adding
 * jurisdictions or contexts, but cannot argue its way out of a rule the deployer set.
 */

/** Newest first. The first is offered when a client asks for one we do not know. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const MAX_TURNS = 2000

const INSTRUCTIONS =
  'Before each message you send to a person, call disclosure_due with the conversation so ' +
  'far. If disclose_now is true, your message must say plainly that you are an AI; the ' +
  'suggestion is wording that works. If identify_now is true, name the business. Never ' +
  'claim to be human, and if someone asks whether you are an AI, say yes. Use ' +
  'disclosure_rules to see which laws apply and why.'

const STRINGS = { type: 'array', items: { type: 'string' }, maxItems: 30 }
const TURNS = {
  type: 'array',
  maxItems: MAX_TURNS,
  description: 'The conversation so far, oldest first: { role: "user" | "ai" | "staff", text, at? (ISO time) }. OpenAI and Anthropic message objects also work.',
  items: { type: 'object' },
}
const SITUATION_PROPS = {
  where: { ...STRINGS, description: 'Extra places the person is, such as US-CA, EU, DE, UK, CA-QC, AU. Added to those the server was started with.' },
  context: { ...STRINGS, description: `Extra facts about the conversation, added to those the server was started with: ${Object.keys(CONTEXTS).join(', ')}.` },
}

/** @type {Array<{ name: string } & Record<string, unknown>>} */
const TOOLS = [
  {
    name: 'disclosure_due',
    title: 'Must my next message say I am an AI?',
    description:
      'Call before each message to a person. Returns disclose_now (say you are an AI in this message), identify_now (name the business), never_claim_human, the reasons with their legal citations, and a suggested wording.',
    inputSchema: { type: 'object', properties: { conversation: TURNS, ...SITUATION_PROPS }, required: ['conversation'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'disclosure_rules',
    title: 'Which AI disclosure laws apply here?',
    description: 'Lists the laws that apply to this conversation, in force and coming: what each requires, its citation and a link to the official text.',
    inputSchema: { type: 'object', properties: { ...SITUATION_PROPS }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'check_conversation',
    title: 'Did this conversation meet the disclosure laws?',
    description: 'Grades a finished or ongoing conversation against every applicable rule: pass, warn, fail or incomplete, with findings per rule.',
    inputSchema: { type: 'object', properties: { conversation: TURNS, ...SITUATION_PROPS }, required: ['conversation'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

/**
 * @typedef {object} ServeOptions
 * @property {string[]} where
 * @property {string} channel
 * @property {string[]} [context]
 * @property {string} [business]
 * @property {boolean} [persistentNotice]
 * @property {NodeJS.ReadableStream} [input]
 * @property {NodeJS.WritableStream} [output]
 * @property {() => number} [now]
 */

/**
 * Serves until the input stream closes.
 *
 * @param {ServeOptions} options
 * @returns {Promise<void>}
 */
export function serve(options) {
  const { input = process.stdin, output = process.stdout } = options
  const send = (/** @type {object} */ message) => {
    output.write(`${JSON.stringify(message)}\n`)
  }
  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', (line) => {
    if (line.trim()) handleLine(line, send, options)
  })
  return new Promise((done) => lines.on('close', () => done()))
}

/**
 * @param {string} line
 * @param {(message: object) => void} send
 * @param {ServeOptions} options
 */
function handleLine(line, send, options) {
  /** @type {any} */
  let message
  try {
    message = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  if (!message || typeof message !== 'object' || !('id' in message)) return // Notifications.
  const { id, method, params } = message
  try {
    send({ jsonrpc: '2.0', id, result: dispatch(method, params ?? {}, options) })
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32603
    send({ jsonrpc: '2.0', id, error: { code, message: /** @type {Error} */ (error).message } })
  }
}

class RpcError extends Error {
  /**
   * @param {number} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

class ToolInputError extends Error {}

/**
 * @param {string} method
 * @param {any} params
 * @param {ServeOptions} options
 * @returns {object}
 */
function dispatch(method, params, options) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-disclosure', title: 'ai-disclosure', version: VERSION },
        instructions: INSTRUCTIONS,
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return callTool(params.name, params.arguments ?? {}, options)
    default:
      throw new RpcError(-32601, `Method not found: ${method}`)
  }
}

/**
 * @param {string} name
 * @param {any} args
 * @param {ServeOptions} options
 * @returns {object}
 */
function callTool(name, args, options) {
  if (!TOOLS.some((t) => t.name === name)) throw new RpcError(-32602, `Unknown tool: ${name}`)
  try {
    const now = options.now?.() ?? Date.now()
    const situation = {
      jurisdictions: [...options.where, ...strings(args.where, 'where')],
      channel: options.channel,
      context: [...(options.context ?? []), ...strings(args.context, 'context')],
      date: now,
    }
    /** @type {Record<string, unknown>} */
    let payload
    if (name === 'disclosure_rules') {
      payload = {
        rules: applicableRules(RULES, situation).map(({ rule, inForce }) => ({
          id: rule.id,
          in_force: inForce,
          effective: rule.effective,
          title: rule.title,
          citation: rule.citation,
          requirement: rule.requirement,
          duties: dutyWords(rule),
          also: rule.duties.other ?? null,
          url: rule.url,
        })),
      }
    } else {
      const conversation = turnsArg(args.conversation)
      if (name === 'disclosure_due') {
        const d = disclosureDue(RULES, situation, conversation, { now, business: options.business, persistentNotice: options.persistentNotice })
        payload = {
          disclose_now: d.discloseNow,
          identify_now: d.identifyNow,
          never_claim_human: d.neverClaimHuman,
          suggestion: d.suggestion,
          reasons: d.reasons,
          outside_the_conversation: d.offConversation,
        }
      } else {
        const r = checkConversation(RULES, situation, conversation, { business: options.business, persistentNotice: options.persistentNotice })
        payload = {
          verdict: r.verdict,
          rules: r.rules.map((x) => ({ id: x.rule.id, in_force: x.inForce, status: x.status, citation: x.rule.citation, findings: x.findings })),
        }
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload }
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof TypeError) {
      return { content: [{ type: 'text', text: /** @type {Error} */ (error).message }], isError: true }
    }
    throw error
  }
}

/**
 * @param {unknown} v
 * @param {string} name
 * @returns {string[]}
 */
function strings(v, name) {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > 30 || !v.every((x) => typeof x === 'string')) throw new ToolInputError(`${name} must be a list of strings.`)
  return v
}

/**
 * @param {unknown} v
 * @returns {import('./check.js').Turn[]}
 */
function turnsArg(v) {
  if (!Array.isArray(v)) throw new ToolInputError('conversation must be a list of messages.')
  if (v.length > MAX_TURNS) throw new ToolInputError(`conversation is too long; send the last ${MAX_TURNS} messages.`)
  return parseConversation(v)
}

export { CHANNELS }
