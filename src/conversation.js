/**
 * Reads conversations as people already store them: the OpenAI and Anthropic message
 * formats, a plain list of turns, or a text transcript with "User:" and "AI:" lines.
 *
 * @typedef {import('./check.js').Turn} Turn
 */

const AI_ROLES = new Set(['assistant', 'ai', 'bot', 'agent', 'model'])
const USER_ROLES = new Set(['user', 'customer', 'caller', 'human_user', 'contact'])
const STAFF_ROLES = new Set(['staff', 'human', 'operator', 'rep', 'employee'])

/**
 * @param {unknown} input Parsed JSON, or a text transcript.
 * @returns {Turn[]}
 */
export function parseConversation(input) {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseConversation(JSON.parse(trimmed))
    return parseTranscript(input)
  }
  const list = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray(/** @type {any} */ (input).messages)
      ? /** @type {any} */ (input).messages
      : input && typeof input === 'object' && Array.isArray(/** @type {any} */ (input).conversation)
        ? /** @type {any} */ (input).conversation
        : null
  if (!list) throw new TypeError('Expected a list of messages, an object with "messages", or a text transcript.')
  /** @type {Turn[]} */
  const turns = []
  for (const m of list) {
    if (!m || typeof m !== 'object') continue
    const role = String(m.role ?? m.speaker ?? m.from ?? '').toLowerCase()
    const mapped = AI_ROLES.has(role) ? 'ai' : USER_ROLES.has(role) ? 'user' : STAFF_ROLES.has(role) ? 'staff' : null
    if (!mapped) continue // system, tool and developer messages are not part of what the person saw.
    const text = textOf(m.text ?? m.content ?? m.message ?? '')
    if (!text.trim()) continue
    const at = m.at ?? m.timestamp ?? m.time ?? m.created_at ?? m.createdAt
    turns.push({ role: mapped, text, ...(at === undefined || at === null ? {} : { at: typeof at === 'number' && at < 1e12 ? at * 1000 : at }) })
  }
  return turns
}

/**
 * Text from a string, or from content blocks ({ type: 'text', text }).
 *
 * @param {unknown} content
 * @returns {string}
 */
function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && typeof b === 'object' && (b.type === 'text' || b.type === 'output_text' || b.type === 'input_text') ? String(b.text ?? '') : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * "User: ...", "AI: ...", "Agent [14:02]: ..." lines; a line without a speaker continues
 * the turn before. An optional ISO time in brackets after the speaker is read as `at`.
 *
 * @param {string} text
 * @returns {Turn[]}
 */
export function parseTranscript(text) {
  /** @type {Turn[]} */
  const turns = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][\w ]{0,20}?)\s*(?:\[([^\]]+)\])?\s*:\s?(.*)$/.exec(line)
    const role = m ? m[1].trim().toLowerCase() : ''
    const mapped = AI_ROLES.has(role) ? 'ai' : USER_ROLES.has(role) ? 'user' : STAFF_ROLES.has(role) ? 'staff' : null
    if (m && mapped) {
      const at = m[2] && Number.isFinite(Date.parse(m[2])) ? m[2] : undefined
      turns.push({ role: mapped, text: m[3], ...(at ? { at } : {}) })
    } else if (turns.length && line.trim()) {
      turns[turns.length - 1].text += `\n${line}`
    }
  }
  return turns
}
