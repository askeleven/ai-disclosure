import { applicableRules } from './check.js'
import { isDisclosure, asksIfAi } from './detect.js'

/**
 * What the AI's next message must say, before it is sent. The checker grades a
 * conversation afterwards; this is for the agent, every turn.
 *
 * @typedef {import('./check.js').Rule} Rule
 * @typedef {import('./check.js').Situation} Situation
 * @typedef {import('./check.js').Turn} Turn
 *
 * @typedef {object} Reason
 * @property {string} rule Rule id.
 * @property {string} citation
 * @property {string} why
 *
 * @typedef {object} Due
 * @property {boolean} discloseNow The next AI message must say it is an AI.
 * @property {boolean} identifyNow The next AI message must name the business.
 * @property {boolean} neverClaimHuman A rule in force forbids claiming to be human, or requires a
 *   disclosure that claiming to be human would undo.
 * @property {Reason[]} reasons
 * @property {string | null} suggestion Wording that would satisfy it, or null if nothing is due.
 * @property {string[]} offConversation Duties in force that a message cannot meet: consent, marking, notices.
 */

/**
 * @param {Rule[]} rules
 * @param {Situation} situation
 * @param {Turn[]} conversation So far, oldest first.
 * @param {{ now?: number, business?: string, persistentNotice?: boolean, phrases?: string[] }} [options]
 * @returns {Due}
 */
export function disclosureDue(rules, situation, conversation, options = {}) {
  const now = options.now ?? Date.now()
  const turns = conversation.map((t) => ({
    role: t.role === 'assistant' ? 'ai' : t.role === 'human' ? 'staff' : t.role,
    text: String(t.text ?? ''),
    at: t.at === undefined || t.at === null ? null : typeof t.at === 'number' ? t.at : Date.parse(t.at),
  }))
  const aiTurns = turns.filter((t) => t.role === 'ai')
  const disclosed = aiTurns.filter((t) => isDisclosure(t.text, options.phrases))
  const lastDisclosure = disclosed.at(-1)
  const lastUser = turns.findLast((t) => t.role !== 'ai')
  const asked = Boolean(lastUser && lastUser.role === 'user' && turns.at(-1) === lastUser && asksIfAi(lastUser.text))
  const lastAt = turns.findLast((t) => t.at !== null)?.at ?? null

  /** @type {Reason[]} */
  const reasons = []
  /** @type {string[]} */
  const offConversation = []
  let identifyNow = false
  let neverClaimHuman = false
  const live = applicableRules(rules, { ...situation, date: situation.date ?? now }).filter((a) => a.inForce)
  for (const { rule } of live) {
    const d = rule.duties
    const persistent = Boolean(options.persistentNotice && d.persistentOk)
    const add = (/** @type {string} */ why) => reasons.push({ rule: rule.id, citation: rule.citation, why })
    // Claiming to be human undoes any disclosure, so every disclosure duty forbids it.
    if (d.noDenial || d.atStart || d.whenAsked || d.everyHours || d.afterIdleHours) neverClaimHuman = true
    if (d.other) offConversation.push(`${rule.id}: ${d.other}`)
    if (d.atStart && !persistent && aiTurns.length === 0) add('The first message must say it is an AI.')
    if (d.atStart && !persistent && aiTurns.length > 0 && disclosed.length === 0) add('It has not said it is an AI yet.')
    if (asked && (d.whenAsked || d.noDenial || d.atStart)) add('They just asked whether they are talking to an AI. Say so plainly.')
    if (d.everyHours && !persistent && aiTurns.length > 0) {
      const since = lastDisclosure?.at ?? aiTurns[0].at
      if (since !== null && now - since >= d.everyHours * 3_600_000) add(`It is ${d.everyHours} ${d.everyHours === 1 ? 'hour' : 'hours'} or more since it last said it is an AI.`)
    }
    if (d.afterIdleHours && lastAt !== null && now - lastAt >= d.afterIdleHours * 3_600_000) add('They are back after a long time away; say it again.')
    if (d.identify === 'every' || (d.identify === 'start' && aiTurns.length === 0)) identifyNow = true
  }
  const discloseNow = reasons.length > 0
  const business = options.business?.trim()
  /** @type {string | null} */
  let suggestion = null
  if (discloseNow || identifyNow) {
    suggestion = discloseNow
      ? `I'm an AI assistant${business ? ` for ${business}` : ''}, not a person.`
      : business
        ? `This is ${business}.`
        : 'Name the business you are contacting them for.'
  }
  return { discloseNow, identifyNow, neverClaimHuman, reasons: dedupe(reasons), suggestion, offConversation: [...new Set(offConversation)] }
}

/**
 * One reason per rule and wording.
 *
 * @param {Reason[]} reasons
 * @returns {Reason[]}
 */
function dedupe(reasons) {
  const seen = new Set()
  return reasons.filter((r) => {
    const k = `${r.rule}|${r.why}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
