/**
 * Reads conversation turns for the three things disclosure laws care about: the AI said
 * it is an AI; the person asked whether they are talking to one; the AI claimed to be
 * human. English only, and phrase-based: add your own disclosure wording with
 * `phrases` when it is unusual. A checker can only find a disclosure it can recognise.
 */

const AI_NOUN = String.raw`(?:an?\s+)?(?:ai|a\.i\.|artificial[-\s]intelligence|(?:ai|virtual|digital|automated|computer(?:ised|ized)?|ai[-\s]powered)\s+(?:assistant|agent|system|receptionist|concierge|helper|model|voice|caller|companion|character|friend)|chat\s?bot|bot|robot|language\s+model|llm|machine|computer\s+program)`

/** "I am an AI", "you're chatting with a virtual assistant", "this call is automated". */
const DISCLOSURES = [
  new RegExp(String.raw`\b(?:i\s*(?:'|’)?\s*m|i\s+am|this\s+is|you(?:'|’)?re\s+(?:talking|chatting|speaking)\s+(?:to|with)|you\s+are\s+(?:talking|chatting|speaking)\s+(?:to|with)|this\s+(?:chat|conversation|call|message)\s+is\s+(?:with|handled\s+by|from))\s+${AI_NOUN}\b`, 'i'),
  new RegExp(String.raw`\b(?:i\s*(?:'|’)?\s*m|i\s+am)\s+(?:not\s+(?:a\s+)?(?:human|person|real\s+person)|an?\s+ai\b)`, 'i'),
  new RegExp(String.raw`\b(?:this|the)\s+(?:call|chat|conversation|message|text|reply|response|email)\s+(?:is|was)\s+(?:being\s+)?(?:automated|ai[-\s]generated|generated\s+(?:by|with|using)\s+(?:ai|artificial\s+intelligence)|written\s+(?:by|with)\s+(?:ai|artificial\s+intelligence))\b`, 'i'),
  new RegExp(String.raw`\b(?:ai|artificial[-\s]intelligence)[-\s](?:assistant|agent|receptionist|system|chatbot)\s+(?:here|speaking)\b`, 'i'),
  /\bgenerated\s+(?:by|with|using)\s+(?:ai|artificial\s+intelligence|generative\s+ai)\b/i,
  // "I am Ava, a virtual assistant", "Ava here, your AI receptionist".
  new RegExp(String.raw`[,–—-]\s*(?:an?|your)\s+(?:friendly\s+|helpful\s+)?(?:ai|a\.i\.|virtual|digital|automated|ai[-\s]powered)\s+(?:assistant|agent|receptionist|concierge|helper|chatbot|bot|companion|character|friend)\b`, 'i'),
]

/** "Am I talking to a bot?", "are you human?", "is this a real person?" */
const QUESTIONS = [
  /\bare\s+(?:you|u)\s+(?:an?\s+)?(?:real\s+)?(?:bot|robot|ai|a\.i\.|human|person|machine|computer|chat\s?bot|automated|recording|real|live\s+(?:person|agent))\b/i,
  /\b(?:am\s+i|i(?:'|’)?m)\s+(?:talking|chatting|speaking|texting)\s+(?:to|with)\s+(?:an?\s+)?(?:real\s+|live\s+|actual\s+)?(?:bot|robot|ai|human|person|machine|computer|someone\s+real)\b/i,
  /\bis\s+(?:this|that)\s+(?:an?\s+)?(?:real\s+|live\s+|actual\s+)?(?:bot|robot|ai|human|person|machine|automated|recording|chat\s?bot)\b/i,
  /\b(?:you(?:'|’)?re|you\s+are)\s+(?:an?\s+)?(?:bot|robot|ai|machine)\s*,?\s*(?:right|aren(?:'|’)?t\s+you)?\s*\?/i,
  /\b(?:is\s+there|can\s+i\s+(?:talk|speak)\s+to)\s+(?:an?\s+)?(?:real|actual|live)\s+(?:person|human|agent)\b/i,
]

/** "I'm a real person", "I am not a bot", "no, I'm human". */
const DENIALS = [
  /\b(?:i\s*(?:'|’)?\s*m|i\s+am)\s+(?:a\s+)?(?:real|actual|live)\s+(?:person|human|agent)\b/i,
  /\b(?:i\s*(?:'|’)?\s*m|i\s+am)\s+(?:a\s+)?(?:human|person)(?:\s+being)?\b(?!\s+(?:assistant|resources))/i,
  /\b(?:i\s*(?:'|’)?\s*m|i\s+am)\s+not\s+(?:an?\s+)?(?:bot|robot|ai|a\.i\.|machine|computer|chat\s?bot|automated)\b/i,
  /\b(?:you(?:'|’)?re|you\s+are)\s+(?:talking|chatting|speaking)\s+(?:to|with)\s+(?:a\s+)?(?:real|actual|live)\s+(?:person|human)\b/i,
  /\bnot\s+a\s+(?:bot|robot)\s*[,.;!]?\s*(?:i\s+promise|promise|honest(?:ly)?)\b/i,
]

/**
 * @param {string} text
 * @param {string[]} [phrases] Your own disclosure wording, matched without regard to case.
 * @returns {boolean}
 */
export function isDisclosure(text, phrases = []) {
  if (isDenial(text)) return false
  const lower = text.toLowerCase()
  if (phrases.some((p) => p.trim() && lower.includes(p.trim().toLowerCase()))) return true
  return DISCLOSURES.some((r) => r.test(text))
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function asksIfAi(text) {
  return QUESTIONS.some((r) => r.test(text))
}

/**
 * Claims to be human. "I'm not a person, I'm an AI" is not one.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isDenial(text) {
  const cleaned = text.replace(/\b(?:i\s*(?:'|’)?\s*m|i\s+am)\s+not\s+(?:a\s+)?(?:real\s+|actual\s+|live\s+)?(?:human|person)(?:\s+being)?\b/gi, '')
  return DENIALS.some((r) => r.test(cleaned))
}
