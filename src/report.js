/**
 * Terminal output for the checker and the rule listing.
 *
 * @typedef {import('./check.js').Result} Result
 * @typedef {import('./check.js').RuleResult} RuleResult
 * @typedef {import('./check.js').Applicable} Applicable
 * @typedef {import('./check.js').Situation} Situation
 * @typedef {import('./check.js').Rule} Rule
 */

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }

/**
 * @param {boolean} on
 */
function painter(on) {
  return (/** @type {string} */ code, /** @type {string} */ text) => (on ? `${code}${text}${C.reset}` : text)
}

const LABEL = /** @type {Record<string, [string, string]>} */ ({
  missed: ['MISSED ', C.red],
  'at-risk': ['AT RISK', C.yellow],
  unknown: ['UNKNOWN', C.yellow],
  pending: ['PENDING', C.cyan],
  met: ['MET    ', C.green],
  'not-checkable': ['ALSO   ', C.dim],
})

const MARK = /** @type {Record<string, string>} */ ({ met: 'ok', missed: 'x ', 'at-risk': '! ', unknown: '? ', pending: '..' })

/**
 * @param {Situation} situation
 * @returns {string}
 */
export function describe(situation) {
  const ctx = situation.context?.length ? ` (${situation.context.join(', ')})` : ''
  return `${situation.channel} in ${situation.jurisdictions.join(', ')}${ctx}`
}

/**
 * @param {Result} result
 * @param {Situation} situation
 * @param {{ colour?: boolean, date: string }} options
 * @returns {string}
 */
export function formatCheck(result, situation, { colour = false, date }) {
  const paint = painter(colour)
  const live = result.rules.filter((r) => r.inForce)
  const coming = result.rules.filter((r) => !r.inForce)
  const headline = { pass: ['PASS', C.green], warn: ['WARN', C.yellow], fail: ['FAIL', C.red], incomplete: ['INCOMPLETE', C.yellow] }[result.verdict]
  const lines = [`${paint(C.bold + headline[1], headline[0])}  ${live.length} ${live.length === 1 ? 'rule' : 'rules'} in force for ${describe(situation)} on ${date}`]
  if (live.length === 0) lines.push('', 'No rule in this dataset applies. That is not the same as no law applying: check the contexts you gave.')
  const order = ['missed', 'unknown', 'at-risk', 'pending', 'met', 'not-checkable']
  for (const r of [...live].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
    const [label, code] = LABEL[r.status]
    lines.push('', `${paint(code, label)}  ${paint(C.bold, r.rule.title)}  ${paint(C.dim, r.rule.id)}`, `         ${r.rule.citation}`)
    for (const f of r.findings) lines.push(`         ${paint(f.status === 'met' ? C.green : f.status === 'missed' ? C.red : C.yellow, MARK[f.status])} ${f.detail}${f.turn !== null ? paint(C.dim, `  (turn ${f.turn + 1})`) : ''}`)
    if (r.rule.duties.other) lines.push(`         ${paint(C.dim, `Also: ${r.rule.duties.other}`)}`)
  }
  if (coming.length) {
    lines.push('', paint(C.bold, 'Coming'))
    for (const r of [...coming].sort((a, b) => a.rule.effective.localeCompare(b.rule.effective))) {
      const would = r.status === 'missed' ? paint(C.red, '  this conversation would fail it') : r.status === 'at-risk' ? paint(C.yellow, '  this conversation would be at risk') : ''
      lines.push(`  ${r.rule.effective}  ${r.rule.title}  ${paint(C.dim, r.rule.id)}${would}`)
    }
  }
  lines.push('', paint(C.dim, 'A summary of the law, not legal advice. Each rule links to its official text.'))
  return `${lines.join('\n')}\n`
}

/**
 * @param {Applicable[]} applicable
 * @param {Situation} situation
 * @param {{ colour?: boolean, date: string }} options
 * @returns {string}
 */
export function formatRules(applicable, situation, { colour = false, date }) {
  const paint = painter(colour)
  const live = applicable.filter((a) => a.inForce)
  const coming = applicable.filter((a) => !a.inForce)
  const lines = [`${paint(C.bold, `${live.length} ${live.length === 1 ? 'rule' : 'rules'} in force`)} for ${describe(situation)} on ${date}${coming.length ? `, ${coming.length} coming` : ''}`]
  /** @param {Rule} rule @param {boolean} inForce */
  const block = (rule, inForce) => {
    lines.push('', `${paint(C.bold, rule.title)}  ${paint(C.dim, rule.id)}`)
    lines.push(`  ${rule.citation}${inForce ? '' : paint(C.yellow, `  from ${rule.effective}`)}${rule.until ? paint(C.dim, `  until ${rule.until}`) : ''}`)
    lines.push(`  ${rule.requirement}`)
    const duties = dutyWords(rule)
    if (duties) lines.push(`  ${paint(C.cyan, duties)}`)
    lines.push(`  ${paint(C.dim, rule.url)}`)
  }
  for (const a of live) block(a.rule, true)
  if (coming.length) lines.push('', paint(C.bold, 'Coming'))
  for (const a of coming) block(a.rule, false)
  if (applicable.length === 0) lines.push('', 'No rule in this dataset applies. Try more contexts: ai-disclosure contexts lists them.')
  lines.push('', paint(C.dim, 'A summary of the law, not legal advice. Read the official text before relying on it.'))
  return `${lines.join('\n')}\n`
}

/**
 * The duties as a short line: "at start, when asked, every 3h, never claim to be human".
 *
 * @param {Rule} rule
 * @returns {string}
 */
export function dutyWords(rule) {
  const d = rule.duties
  const parts = []
  if (d.atStart) parts.push('at the start')
  if (d.whenAsked) parts.push('when asked')
  if (d.everyHours) parts.push(`every ${d.everyHours} ${d.everyHours === 1 ? 'hour' : 'hours'}`)
  if (d.afterIdleHours) parts.push(`after ${Math.round(d.afterIdleHours / 24)} days away`)
  if (d.persistentOk) parts.push('or a notice shown throughout')
  if (d.noDenial) parts.push('never claim to be human')
  if (d.identify) parts.push(d.identify === 'start' ? 'name the business at the start' : 'name the business in every message')
  if (d.ifMisleading && parts.length) parts.push('if a reasonable person could think it is human')
  return parts.join(', ')
}
