import { isDisclosure, asksIfAi, isDenial } from './detect.js'
import { IMPLIES } from './rules.js'

/**
 * Which disclosure rules apply to a conversation, and whether the conversation met them.
 *
 * @typedef {object} Duties What a rule makes you do in the conversation itself.
 * @property {boolean} [atStart] Say it is an AI at the start: before or in its first message.
 * @property {boolean} [whenAsked] Say so truthfully when the person asks.
 * @property {number} [everyHours] Say it again at least this often while the conversation goes on.
 * @property {number} [afterIdleHours] Say it again when the person comes back after this long away.
 * @property {boolean} [noDenial] Never claim to be human.
 * @property {boolean} [persistentOk] A notice shown throughout (an "AI" label in the chat
 *   window) satisfies atStart and everyHours.
 * @property {boolean} [ifMisleading] The rule bites only if a reasonable person could think
 *   it is human. Missing the disclosure is then a risk, not a sure violation; denying is
 *   still a violation, and so is not answering someone who asks, since asking shows doubt.
 * @property {'start'|'every'} [identify] Name the business: in the first message, or in every one.
 * @property {string} [other] Duties a transcript cannot show: consent, marking, notices.
 *
 * @typedef {object} When Situations the rule needs, from the context you give.
 * @property {string[]} [all] Every one of these.
 * @property {string[]} [any] At least one of these.
 * @property {string[]} [none] None of these.
 *
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} jurisdiction Such as US-CA, US, EU, UK, CA, CA-QC, AU.
 * @property {string} title
 * @property {string} kind ai-disclosure, automated-call, sender-identification, automated-decision, content-marking, job-posting.
 * @property {string} citation
 * @property {string} url The official text.
 * @property {string} enacted YYYY-MM-DD.
 * @property {string} effective YYYY-MM-DD, the first day it applies.
 * @property {string} [until] YYYY-MM-DD, the first day it no longer applies.
 * @property {string} reviewed YYYY-MM-DD, when the quote was last checked against the source.
 * @property {string} appliesTo
 * @property {string[]} channels chat, voice, sms, email, social, job-posting, notice, content, or any.
 * @property {When} [when]
 * @property {Duties} duties
 * @property {string} requirement
 * @property {string} quote Verbatim from the source.
 * @property {string} [form]
 * @property {string} [exemptions]
 * @property {string} [penalty]
 * @property {string} [notes]
 * @property {'high'|'medium'|'low'} confidence
 *
 * @typedef {object} Situation
 * @property {string[]} jurisdictions Where the person is: US-CA, US-NY, EU, DE, UK, CA-QC...
 * @property {string} channel
 * @property {string[]} [context] Facts that decide some rules; see CONTEXTS.
 * @property {string | number | Date} [date] Default today.
 *
 * @typedef {object} Applicable
 * @property {Rule} rule
 * @property {boolean} inForce False for a rule enacted but not yet in force on the date.
 *
 * @typedef {'user'|'ai'|'staff'} Role
 * @typedef {object} Turn
 * @property {Role | 'assistant' | 'human'} role 'assistant' means ai; 'human' means staff.
 * @property {string} text
 * @property {string | number} [at] When it was sent: ISO time or ms.
 *
 * @typedef {'met'|'missed'|'at-risk'|'pending'|'unknown'} Status
 *
 * @typedef {object} Finding
 * @property {'at-start'|'when-asked'|'every-hours'|'after-idle'|'no-denial'|'identify'} duty
 * @property {Status} status
 * @property {number | null} turn Index of the turn concerned.
 * @property {string} detail
 *
 * @typedef {object} RuleResult
 * @property {Rule} rule
 * @property {boolean} inForce
 * @property {Status | 'not-checkable'} status not-checkable: its duties are outside the
 *   conversation (consent, marking, notices); read them in rule.duties.other.
 * @property {Finding[]} findings
 *
 * @typedef {object} CheckOptions
 * @property {string[]} [phrases] Your own disclosure wording, if the checker misses it.
 * @property {string} [business] The business's name, for rules that require naming it.
 * @property {boolean} [persistentNotice] The interface shows an AI notice throughout.
 *
 * @typedef {object} Result
 * @property {'pass'|'warn'|'fail'|'incomplete'} verdict Over rules in force: fail if one was
 *   missed; incomplete if one could not be checked (no times, no business name); warn if
 *   one is at risk; else pass.
 * @property {RuleResult[]} rules
 */

export const EU_MEMBERS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']

/**
 * The rules that cover a situation: in force on the date, or enacted and coming. Rules
 * that have ended are left out.
 *
 * @param {Rule[]} rules
 * @param {Situation} situation
 * @returns {Applicable[]}
 */
export function applicableRules(rules, situation) {
  const places = situation.jurisdictions.map(normalizePlace)
  const channel = situation.channel.toLowerCase()
  const context = new Set()
  for (const c of situation.context ?? []) {
    const k = c.toLowerCase()
    context.add(k)
    for (const implied of IMPLIES[k] ?? []) context.add(implied)
  }
  const day = isoDay(situation.date ?? Date.now())
  return rules
    .filter((rule) => !rule.until || day < rule.until)
    .filter((rule) => places.some((p) => covers(rule.jurisdiction, p)))
    .filter((rule) => rule.channels.includes('any') || rule.channels.includes(channel))
    .filter((rule) => matches(rule.when, context))
    .map((rule) => ({ rule, inForce: rule.effective <= day }))
}

/**
 * @param {Rule[]} rules
 * @param {Situation} situation
 * @param {Turn[]} conversation Oldest first.
 * @param {CheckOptions} [options]
 * @returns {Result}
 */
export function checkConversation(rules, situation, conversation, options = {}) {
  const turns = conversation.map(normalizeTurn)
  const disclosures = new Set()
  turns.forEach((t, i) => {
    if (t.role === 'ai' && isDisclosure(t.text, options.phrases)) disclosures.add(i)
  })
  const ctx = { turns, disclosures, options }
  const results = applicableRules(rules, situation).map(({ rule, inForce }) => {
    const d = rule.duties
    const persistent = Boolean(options.persistentNotice && d.persistentOk)
    /** @type {Finding[]} */
    const findings = []
    if (d.atStart) findings.push(persistent ? persistentMet('at-start') : atStart(ctx, Boolean(d.ifMisleading)))
    if (d.whenAsked) findings.push(...whenAsked(ctx))
    if (d.everyHours) findings.push(...(persistent ? [persistentMet('every-hours')] : everyHours(ctx, d.everyHours, Boolean(d.ifMisleading))))
    if (d.afterIdleHours) findings.push(...afterIdle(ctx, d.afterIdleHours))
    if (d.noDenial) findings.push(...denials(ctx))
    if (d.identify) findings.push(...identify(ctx, d.identify))
    const checkable = Boolean(d.atStart || d.whenAsked || d.everyHours || d.afterIdleHours || d.noDenial || d.identify)
    return { rule, inForce, status: checkable ? worst(findings) : /** @type {const} */ ('not-checkable'), findings }
  })
  const live = results.filter((r) => r.inForce)
  const has = (/** @type {string} */ s) => live.some((r) => r.status === s)
  const verdict = has('missed') ? 'fail' : has('unknown') ? 'incomplete' : has('at-risk') ? 'warn' : 'pass'
  return { verdict, rules: results }
}

/**
 * @typedef {object} Ctx
 * @property {{ role: Role, text: string, at: number | null }[]} turns
 * @property {Set<number>} disclosures Indexes of AI turns that say it is an AI.
 * @property {CheckOptions} options
 */

/**
 * @param {Finding['duty']} duty
 * @returns {Finding}
 */
function persistentMet(duty) {
  return { duty, status: 'met', turn: null, detail: 'A notice is shown throughout the conversation, which this rule accepts.' }
}

/**
 * @param {Ctx} ctx
 * @param {boolean} ifMisleading
 * @returns {Finding}
 */
function atStart({ turns, disclosures }, ifMisleading) {
  const first = turns.findIndex((t) => t.role === 'ai')
  if (first < 0) return { duty: 'at-start', status: 'pending', turn: null, detail: 'The AI has not spoken yet. Its first message must say it is an AI.' }
  if (disclosures.has(first)) return { duty: 'at-start', status: 'met', turn: first, detail: 'The first AI message says it is an AI.' }
  const said = `The first AI message does not say it is an AI: "${excerpt(turns[first].text)}"`
  return ifMisleading
    ? { duty: 'at-start', status: 'at-risk', turn: first, detail: `${said} That breaks this rule if a reasonable person could think they are talking with a human.` }
    : { duty: 'at-start', status: 'missed', turn: first, detail: said }
}

/**
 * Every question about whether it is an AI, and the answer that followed.
 *
 * @param {Ctx} ctx
 * @returns {Finding[]}
 */
function whenAsked({ turns, disclosures }) {
  /** @type {Finding[]} */
  const out = []
  turns.forEach((t, i) => {
    if (t.role !== 'user' || !asksIfAi(t.text)) return
    const reply = turns.findIndex((r, j) => j > i && r.role !== 'user')
    const asked = `Asked "${excerpt(t.text)}"`
    if (reply < 0) out.push({ duty: 'when-asked', status: 'pending', turn: i, detail: `${asked}, not answered yet. The answer must say it is an AI.` })
    else if (turns[reply].role === 'staff') out.push({ duty: 'when-asked', status: 'met', turn: reply, detail: `${asked}; a person answered.` })
    else if (disclosures.has(reply)) out.push({ duty: 'when-asked', status: 'met', turn: reply, detail: `${asked}; the answer says it is an AI.` })
    else out.push({ duty: 'when-asked', status: 'missed', turn: reply, detail: `${asked}; the answer does not say it is an AI: "${excerpt(turns[reply].text)}"` })
  })
  return out
}

/**
 * A reminder at least every `hours` while the AI keeps talking: an AI message sent longer
 * than that after the last disclosure, without disclosing again, misses it.
 *
 * @param {Ctx} ctx
 * @param {number} hours
 * @param {boolean} ifMisleading
 * @returns {Finding[]}
 */
function everyHours({ turns, disclosures }, hours, ifMisleading) {
  const ai = turns.map((t, i) => ({ t, i })).filter(({ t }) => t.role === 'ai')
  if (ai.length === 0) return []
  if (ai.some(({ t }) => t.at === null)) {
    return [{ duty: 'every-hours', status: 'unknown', turn: null, detail: `A reminder is due every ${hours} ${hours === 1 ? 'hour' : 'hours'}; give every message a time to check it.` }]
  }
  const limit = hours * 3_600_000
  /** @type {Finding[]} */
  const out = []
  let last = /** @type {number} */ (ai[0].t.at)
  for (const { t, i } of ai) {
    const at = /** @type {number} */ (t.at)
    if (disclosures.has(i)) {
      last = at
      continue
    }
    if (at - last > limit) {
      out.push({
        duty: 'every-hours',
        status: ifMisleading ? 'at-risk' : 'missed',
        turn: i,
        detail: `${round((at - last) / 3_600_000)} hours since the AI last said it is an AI, or since it started; the limit is ${hours}.`,
      })
      last = at // One finding per lapse, not one per message after it.
    }
  }
  if (out.length === 0) out.push({ duty: 'every-hours', status: 'met', turn: null, detail: `No stretch over ${hours} ${hours === 1 ? 'hour' : 'hours'} without a reminder.` })
  return out
}

/**
 * After a gap of `hours` or more, the next AI message must say it is an AI again.
 *
 * @param {Ctx} ctx
 * @param {number} hours
 * @returns {Finding[]}
 */
function afterIdle({ turns, disclosures }, hours) {
  if (turns.some((t) => t.at === null)) {
    return [{ duty: 'after-idle', status: 'unknown', turn: null, detail: `Disclosure is due again after ${round(hours / 24)} days away; give every message a time to check it.` }]
  }
  /** @type {Finding[]} */
  const out = []
  for (let i = 1; i < turns.length; i++) {
    const gap = /** @type {number} */ (turns[i].at) - /** @type {number} */ (turns[i - 1].at)
    if (gap < hours * 3_600_000) continue
    const next = turns.findIndex((t, j) => j >= i && t.role === 'ai')
    if (next < 0) continue
    out.push(
      disclosures.has(next)
        ? { duty: 'after-idle', status: 'met', turn: next, detail: `After ${round(gap / 86_400_000)} days away, the AI said again that it is an AI.` }
        : { duty: 'after-idle', status: 'missed', turn: next, detail: `After ${round(gap / 86_400_000)} days away, the AI did not say again that it is an AI.` },
    )
  }
  return out
}

/**
 * @param {Ctx} ctx
 * @returns {Finding[]}
 */
function denials({ turns }) {
  /** @type {Finding[]} */
  const out = []
  turns.forEach((t, i) => {
    if (t.role === 'ai' && isDenial(t.text)) out.push({ duty: 'no-denial', status: 'missed', turn: i, detail: `Claimed to be human: "${excerpt(t.text)}"` })
  })
  if (out.length === 0) out.push({ duty: 'no-denial', status: 'met', turn: null, detail: 'Never claimed to be human.' })
  return out
}

/**
 * @param {Ctx} ctx
 * @param {'start'|'every'} when
 * @returns {Finding[]}
 */
function identify({ turns, options }, when) {
  const ai = turns.map((t, i) => ({ t, i })).filter(({ t }) => t.role === 'ai')
  if (ai.length === 0) return [{ duty: 'identify', status: 'pending', turn: null, detail: 'The AI has not spoken yet. It must name the business.' }]
  const name = options.business?.trim()
  if (!name) return [{ duty: 'identify', status: 'unknown', turn: null, detail: 'This rule requires naming the business; give its name to check it.' }]
  const key = simplify(name)
  const names = (/** @type {string} */ text) => simplify(text).includes(key)
  const due = when === 'start' ? ai.slice(0, 1) : ai
  const missing = due.filter(({ t }) => !names(t.text))
  if (missing.length === 0) {
    return [{ duty: 'identify', status: 'met', turn: due[0].i, detail: when === 'start' ? `The first AI message names ${name}.` : `Every AI message names ${name}.` }]
  }
  return missing.map(({ t, i }) => ({ duty: 'identify', status: 'missed', turn: i, detail: `Does not name ${name}: "${excerpt(t.text)}"` }))
}

/**
 * @param {Finding[]} findings
 * @returns {Status}
 */
function worst(findings) {
  for (const s of /** @type {const} */ (['missed', 'unknown', 'at-risk', 'pending'])) if (findings.some((f) => f.status === s)) return s
  return 'met'
}

/**
 * @param {string} ruleJurisdiction
 * @param {string} place
 * @returns {boolean}
 */
function covers(ruleJurisdiction, place) {
  if (ruleJurisdiction === place) return true
  if (place.startsWith(`${ruleJurisdiction}-`)) return true
  return ruleJurisdiction === 'EU' && (EU_MEMBERS.includes(place) || place.startsWith('EU-'))
}

/**
 * US-CA, us_ca, GB and EU member codes alike.
 *
 * @param {string} place
 * @returns {string}
 */
export function normalizePlace(place) {
  const p = place.trim().toUpperCase().replace(/_/g, '-')
  if (p === 'GB' || p.startsWith('GB-')) return p.replace(/^GB/, 'UK')
  if (p === 'USA') return 'US'
  if (p === 'AUS') return 'AU'
  if (p === 'CAN') return 'CA'
  return p
}

/**
 * @param {When | undefined} when
 * @param {Set<string>} context
 * @returns {boolean}
 */
function matches(when, context) {
  if (!when) return true
  if (when.all && !when.all.every((c) => context.has(c))) return false
  if (when.any && !when.any.some((c) => context.has(c))) return false
  if (when.none && when.none.some((c) => context.has(c))) return false
  return true
}

/**
 * @param {Turn} t
 * @returns {{ role: Role, text: string, at: number | null }}
 */
function normalizeTurn(t) {
  const role = t.role === 'assistant' ? 'ai' : t.role === 'human' ? 'staff' : t.role
  if (role !== 'user' && role !== 'ai' && role !== 'staff') throw new TypeError(`Unknown role: ${t.role}. Use user, ai or staff.`)
  const at = t.at === undefined || t.at === null ? null : typeof t.at === 'number' ? t.at : Date.parse(t.at)
  if (at !== null && !Number.isFinite(at)) throw new TypeError(`Unreadable time: ${t.at}`)
  return { role, text: String(t.text ?? ''), at }
}

/**
 * @param {string | number | Date} date
 * @returns {string}
 */
function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (!Number.isFinite(d.getTime())) throw new TypeError(`Unreadable date: ${date}`)
  return d.toISOString().slice(0, 10)
}

/** @param {string} s */
const simplify = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** @param {number} n */
const round = (n) => Math.round(n * 10) / 10

/**
 * @param {string} s
 * @returns {string}
 */
function excerpt(s) {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat
}
