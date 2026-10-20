import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RULES, REVIEWED, CONTEXTS, CHANNELS, applicableRules } from '../src/index.js'

const OFFICIAL = [
  'leginfo.legislature.ca.gov', 'le.utah.gov', 'leg.colorado.gov', 'capitol.texas.gov', 'www.nysenate.gov',
  'legislature.maine.gov', 'lawfilesext.leg.wa.gov', 'olis.oregonlegislature.gov', 'www.cga.ct.gov',
  'nebraskalegislature.gov', 'legislature.idaho.gov', 'www.legis.iowa.gov', 'www.legis.ga.gov',
  'data.capitol.hawaii.gov', 'webserver.rilegislature.gov', 'docs.fcc.gov', 'www.ecfr.gov', 'eur-lex.europa.eu',
  'www.legislation.gov.uk', 'crtc.gc.ca', 'laws-lois.justice.gc.ca', 'www.legisquebec.gouv.qc.ca',
  'www.ontario.ca', 'www.legislation.gov.au',
]
const DAY = /^\d{4}-\d{2}-\d{2}$/

test('every rule is complete, cites an official source, and quotes it', () => {
  const ids = new Set()
  for (const r of RULES) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`)
    ids.add(r.id)
    assert.match(r.id, /^[a-z0-9-]+$/)
    assert.ok(OFFICIAL.includes(new URL(r.url).host), `${r.id}: ${r.url} is not an official source`)
    for (const k of /** @type {const} */ (['title', 'citation', 'appliesTo', 'requirement', 'quote'])) assert.ok(r[k].length > 10, `${r.id}: ${k}`)
    for (const k of /** @type {const} */ (['enacted', 'effective', 'reviewed'])) assert.match(r[k], DAY, `${r.id}: ${k}`)
    assert.ok(r.enacted <= r.effective, `${r.id}: enacted after effective`)
    if (r.until) assert.ok(r.effective < r.until, `${r.id}: until before effective`)
    assert.equal(r.reviewed, REVIEWED)
    assert.ok(r.channels.length && r.channels.every((c) => c === 'any' || CHANNELS.includes(c)), `${r.id}: channels`)
    for (const c of [...(r.when?.all ?? []), ...(r.when?.any ?? []), ...(r.when?.none ?? [])]) assert.ok(c in CONTEXTS, `${r.id}: unknown context ${c}`)
    const d = r.duties
    assert.ok(d.atStart || d.whenAsked || d.everyHours || d.afterIdleHours || d.noDenial || d.identify || d.other, `${r.id}: no duties`)
    assert.ok(['high', 'medium', 'low'].includes(r.confidence))
  }
})

test('covers the US, the EU, the UK, Canada and Australia', () => {
  const places = new Set(RULES.map((r) => r.jurisdiction.split('-')[0]))
  for (const p of ['US', 'EU', 'UK', 'CA', 'AU']) assert.ok(places.has(p), p)
})

test('a place covers its own rules and its country\'s; an EU member gets EU rules', () => {
  const ids = (/** @type {any} */ s) => applicableRules(RULES, { channel: 'chat', date: '2026-10-17', ...s }).map((a) => a.rule.id)
  const de = ids({ jurisdictions: ['DE'] })
  assert.ok(de.includes('eu-ai-act-50-1'))
  assert.ok(!de.some((id) => id.startsWith('us-')))
  const ca = ids({ jurisdictions: ['us-ca'], context: ['commerce'] })
  assert.ok(ca.includes('us-ca-sb1001'))
  assert.ok(!ca.includes('us-ut-13-77-103-1'))
  // Without the context, the commerce rule does not apply.
  assert.ok(!ids({ jurisdictions: ['US-CA'] }).includes('us-ca-sb1001'))
  // Canada-wide rules reach Quebec; Quebec's do not reach Ontario.
  const qc = ids({ jurisdictions: ['CA-QC'], channel: 'email', context: ['marketing', 'automated-decision'] })
  assert.ok(qc.includes('ca-casl-6') && qc.includes('ca-qc-p39-1-12-1'))
  assert.ok(!ids({ jurisdictions: ['CA-ON'], channel: 'email', context: ['automated-decision'] }).includes('ca-qc-p39-1-12-1'))
  // GB is the UK.
  assert.ok(ids({ jurisdictions: ['GB'], channel: 'voice', context: ['marketing', 'outbound'] }).includes('uk-pecr-19'))
})

test('dates decide: coming rules are flagged, ended rules drop out, companion implies general-chatbot', () => {
  const at = (/** @type {string} */ date) =>
    applicableRules(RULES, { jurisdictions: ['US-CA', 'US-CO'], channel: 'chat', context: ['companion', 'minor'], date })
  const before = at('2026-10-17')
  assert.equal(before.find((a) => a.rule.id === 'us-ca-sb243-minors')?.inForce, true)
  assert.equal(before.find((a) => a.rule.id === 'us-co-hb26-1263')?.inForce, false, 'coming 2027-01-01')
  const gap = at('2027-03-01')
  assert.ok(!gap.some((a) => a.rule.id === 'us-ca-sb243-minors'), 'repealed from 2027-01-01')
  assert.equal(gap.find((a) => a.rule.id === 'us-ca-sb1119')?.inForce, false, 'not until 2027-07-01')
  assert.equal(gap.find((a) => a.rule.id === 'us-co-hb26-1263')?.inForce, true, 'companion implies general-chatbot')
})

test('the README table matches the rules', async () => {
  const { readFileSync } = await import('node:fs')
  const { table } = await import('../scripts/readme-table.js')
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  assert.ok(readme.includes(table()), 'run node scripts/readme-table.js')
})
