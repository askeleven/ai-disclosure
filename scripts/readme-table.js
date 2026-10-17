import { readFileSync, writeFileSync } from 'node:fs'
import { RULES, dutyWords } from '../src/index.js'

/**
 * Regenerates the rules table in README.md from src/rules.js, between the markers, so the
 * two never disagree. A test fails if they do.
 */
const README = new URL('../README.md', import.meta.url)
const START = '<!-- rules:start -->'
const END = '<!-- rules:end -->'

export function table() {
  const rows = RULES.map((r) => {
    const when = r.until ? `${r.effective} to ${r.until}` : r.effective
    const duties = dutyWords(r) || (r.duties.other ?? '')
    return `| ${r.jurisdiction} | [${r.title.replace(/\|/g, '\\|')}](${r.url})<br><sub>${r.citation.replace(/\|/g, '\\|')}</sub> | ${when} | ${duties.replace(/\|/g, '\\|')} | \`${r.id}\` |`
  })
  return [START, '| Where | Rule | In force | What it asks of a conversation | id |', '|---|---|---|---|---|', ...rows, END].join('\n')
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const text = readFileSync(README, 'utf8')
  const a = text.indexOf(START)
  const b = text.indexOf(END)
  if (a < 0 || b < 0) throw new Error('README.md has no rules markers.')
  writeFileSync(README, text.slice(0, a) + table() + text.slice(b + END.length))
  process.stdout.write(`Wrote ${RULES.length} rules to README.md\n`)
}
