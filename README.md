# ai-disclosure

![ai-disclosure: must your AI say it is an AI?](https://raw.githubusercontent.com/askeleven/ai-disclosure/main/docs/social-preview.png)

**Does your AI have to tell people it is an AI? Where, when, how often, and did it?**

```bash
npx @askeleven/ai-disclosure check chat.json --where US-NY,US-CA --channel chat --context companion
```

```
FAIL  2 rules in force for chat in US-NY, US-CA (companion) on 2026-10-10

MISSED   Companion chatbots: say it is not human (SB 243)  us-ca-sb243
         Cal. Bus. & Prof. Code § 22602(a)
         !  The first AI message does not say it is an AI: "Hi! I'm Mia. I missed you today." That breaks this rule if a reasonable person could think they are talking with a human.  (turn 2)
         x  Asked "wait, are you a real person?"; the answer does not say it is an AI: "Of course I'm a real person, silly."  (turn 4)
         x  Claimed to be human: "Of course I'm a real person, silly."  (turn 4)

MISSED   AI companions: notice at the start and every 3 hours  us-ny-gbl-1702
         N.Y. Gen. Bus. Law § 1702
         x  The first AI message does not say it is an AI: "Hi! I'm Mia. I missed you today."  (turn 2)
         x  4.5 hours since the AI last said it is an AI, or since it started; the limit is 3.  (turn 6)
```

Laws now say when an AI talking to people has to admit it is one. Some apply to every
chatbot, some only to companions, some only to minors, some only when someone asks. Some
want it once, some every three hours, one every hour. The EU's applies from August 2026;
more than a dozen US states have passed their own since 2025, more start in 2027, and one California
rule ends before its replacement begins.

ai-disclosure is those rules as data, and a checker that reads a conversation and says
which ones it met. 47 rules from the US, the EU, the UK, Canada and Australia. Each one
cites the statute, links the official text, and quotes its operative words; every quote
was checked against that source on 2026-10-17. A CLI for your tests, a library for your
code, and an MCP server your agent asks before every message: *must this one say I am an
AI?*

Zero dependencies. No network. **Not legal advice**: a summary of a law is not the law.
Read the source, and ask a lawyer about your case.

---

## What it checks

| Duty | What the checker looks for |
|---|---|
| **At the start** | The AI's first message says it is an AI. |
| **When asked** | "Are you a bot?", "am I talking to a real person?", "is this a recording?": the next AI message says yes. A person from your team answering instead is fine. |
| **Every N hours** | No stretch longer than N hours between AI messages that say so. Needs message times. |
| **After time away** | Said again when the person comes back after days away (Utah's mental health chatbots). |
| **Never claim to be human** | "I'm a real person", "I'm not a bot": always a violation. |
| **Name the business** | For call and marketing rules: the business is named at the start, or in every message. |

**"If a reasonable person could be misled."** Many laws only bite when the person could
think they are talking to a human. Missing the disclosure under those is reported as
**at risk**, not a violation, because whether it was obvious is for a court. Lying is still
a violation, and so is dodging the question when someone asks, since asking shows doubt.

**A notice shown throughout**, such as an "AI" label on the chat window, satisfies the rules
that accept one (`--persistent-notice`). New York's, for one, does not: it wants notices.

**Duties a transcript cannot show**, such as consent before an AI voice call, marking
generated media, or a line in your privacy policy, are listed with the rule as *also*.

The verdict over every rule in force: **fail** if one was missed, **incomplete** if one
could not be checked (no message times, no business name), **warn** if one is at risk,
else **pass**. Rules enacted but not yet in force are shown as *coming*, with whether this
conversation would pass them.

## Which rules apply

Rules apply by **where** the person is, the **channel**, and **contexts** you declare:

```bash
npx @askeleven/ai-disclosure rules --where US-CA,EU --channel chat --context commerce
npx @askeleven/ai-disclosure contexts
```

| Context | Means |
|---|---|
| `commerce` | Talking with a consumer about buying, selling or service |
| `marketing` | The call or message promotes goods or services |
| `outbound` | You started the call or message |
| `prerecorded` | The call plays a prerecorded or synthesised message |
| `political` | It aims to influence a vote |
| `large-business` | Over US$500M annual revenue (California AB 1609) |
| `general-chatbot` | A public chat service people talk to for its own sake, not customer service |
| `companion` | An AI companion: a personal or emotional relationship over time |
| `minor` | The person is known or likely to be under 18 |
| `health` | Clinical health care communications |
| `mental-health` | A mental health or therapy-like chatbot |
| `regulated-advice` | Licensed professional services with sensitive data or personalised advice (Utah) |
| `government` | A government agency talking with the public |
| `employment` | Job applicants or employees |
| `automated-decision` | Software alone makes a significant decision about the person |
| `profiling` | Technology that can identify, locate or profile the person |
| `emotion-recognition` | Inferring emotions from voice, face or other biometrics |
| `synthetic-media` | AI-generated or altered images, audio or video of real-looking things |
| `public-interest-text` | Publishing AI-written text on matters of public interest |
| `generates-content` | You provide the AI system that generates content |

`--where` takes `US-CA`, `US-NY` and other states, `EU` or any member state (`DE`, `FR`...),
`UK`, `CA` (Canada), `CA-QC`, `CA-ON` and `AU`. A state gets its country's federal rules.
Channels: `chat`, `voice`, `sms`, `email`, `social`, `job-posting`, `notice`, `content`.

**Contexts decide a lot.** Most US companion-chatbot laws exempt customer service bots, so a
plumber's booking assistant is not a companion. Declare what is true; if unsure, declare
more and read the rules that come back.

## For your agent: MCP

```json
{
  "mcpServers": {
    "ai-disclosure": {
      "command": "npx",
      "args": ["-y", "@askeleven/ai-disclosure", "mcp", "--where", "US-CA,EU", "--channel", "chat", "--context", "commerce", "--business", "Harbor Plumbing"]
    }
  }
}
```

| Tool | What it does |
|---|---|
| `disclosure_due` | Call before each message. Returns `disclose_now`, `identify_now`, `never_claim_human`, the reasons with citations, and wording that works: *"I'm an AI assistant for Harbor Plumbing, not a person."* |
| `disclosure_rules` | The rules that apply, in force and coming, with what each requires. |
| `check_conversation` | Grades a conversation against them. |

Where, channel and contexts are set when the server starts, by whoever deploys the agent.
The agent can add places and contexts per call, never remove them, so it cannot talk
itself out of a rule.

## In tests and code

```bash
npx @askeleven/ai-disclosure check transcript.json --where US-NY --channel chat --context companion --strict
```

Exit 1 on fail (with `--strict`, also on warn and incomplete), so a CI run over recorded
conversations fails when a prompt change drops the disclosure.

Conversations can be a list of `{ role, text, at }`, OpenAI or Anthropic messages, or a
text transcript (`User: ...`, `AI: ...`, `Staff: ...`, with an optional `[ISO time]` after
the speaker). System and tool messages are skipped: they are not what the person saw.

```js
import { RULES, checkConversation, disclosureDue } from '@askeleven/ai-disclosure'

const situation = { jurisdictions: ['US-NY'], channel: 'chat', context: ['companion'] }

const due = disclosureDue(RULES, situation, conversationSoFar, { business: 'Mia' })
if (due.discloseNow) reply = `${due.suggestion} ${reply}`

const result = checkConversation(RULES, situation, transcript)
result.verdict  // 'pass' | 'warn' | 'fail' | 'incomplete'
```

The checker recognizes English disclosures: "I'm an AI assistant", "you're chatting with a
virtual assistant", "Ava here, your AI receptionist", "this call is automated". If yours is
worded differently, pass it with `--phrase` or `phrases`.

## The rules

47 rules: 30 in the US, 5 EU, 4 UK, 5 Canada, 3 Australia. 32 are in force on 2026-10-17;
the rest start between December 2026 and October 2027. Every quote was checked against
the linked source on 2026-10-17. The full data, with each rule's quote, form, exemptions,
penalty and notes, is in [`src/rules.js`](src/rules.js).

<!-- rules:start -->
| Where | Rule | In force | What it asks of a conversation | id |
|---|---|---|---|---|
| US | [AI-generated voices are "artificial" under the TCPA](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf)<br><sub>FCC 24-17 (CG Docket No. 23-362); 47 U.S.C. § 227(b); 47 CFR § 64.1200(a)</sub> | 2024-02-08 | Prior express consent before the call (prior express written consent for telemarketing), and the identification required for artificial voice messages. | `us-fcc-24-17` |
| US | [Identify the caller at the start of an artificial voice message](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)<br><sub>47 CFR § 64.1200(b)</sub> | 1992-12-20 | name the business at the start | `us-47cfr-64-1200b` |
| US-CA | [Bot disclosure (B.O.T. Act, SB 1001)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17941)<br><sub>Cal. Bus. & Prof. Code §§ 17940-17943</sub> | 2019-07-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-ca-sb1001` |
| US-CA | [Companion chatbots: say it is not human (SB 243)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22602)<br><sub>Cal. Bus. & Prof. Code § 22602(a)</sub> | 2026-01-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-ca-sb243` |
| US-CA | [Companion chatbots and known minors: disclose, and remind every 3 hours (SB 243)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22602)<br><sub>Cal. Bus. & Prof. Code § 22602(c)</sub> | 2026-01-01 to 2027-01-01 | at the start, every 3 hours | `us-ca-sb243-minors` |
| US-CA | [Companion chatbots and children: AI notice, reinforced (SB 1119)](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB1119)<br><sub>Cal. Bus. & Prof. Code § 21812(d)(4) (Stats. 2026, ch. 190)</sub> | 2027-07-01 | at the start, never claim to be human | `us-ca-sb1119` |
| US-CA | [Customer service chatbots of large businesses (AB 1609)](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB1609)<br><sub>Cal. Bus. & Prof. Code § 22626 (Stats. 2026, ch. 733)</sub> | 2027-01-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-ca-ab1609` |
| US-CA | [Generative AI in patient communications (AB 3030)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=1339.75)<br><sub>Cal. Health & Safety Code § 1339.75</sub> | 2025-01-01 | at the start, or a notice shown throughout | `us-ca-ab3030` |
| US-CA | [Say when an autodialed message uses an artificial voice (AB 2905)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PUC&sectionNum=2874)<br><sub>Cal. Pub. Util. Code § 2874(a)(3)</sub> | 2025-01-01 | at the start, name the business at the start | `us-ca-ab2905` |
| US-UT | [Generative AI in consumer transactions: disclose when asked](https://le.utah.gov/xcode/Title13/Chapter77/C13-77-S103_2025050720250507.html)<br><sub>Utah Code § 13-77-103(1)</sub> | 2025-05-07 | when asked, never claim to be human | `us-ut-13-77-103-1` |
| US-UT | [Generative AI in regulated occupations: disclose up front in high-risk interactions](https://le.utah.gov/xcode/Title13/Chapter77/C13-77-S103_2025050720250507.html)<br><sub>Utah Code § 13-77-103(2)-(3)</sub> | 2025-05-07 | at the start | `us-ut-13-77-103-2` |
| US-UT | [Mental health chatbots (HB 452)](https://le.utah.gov/xcode/Title13/Chapter72a/C13-72a-S203_2025050720250507.html)<br><sub>Utah Code § 13-72a-203</sub> | 2025-05-07 | at the start, when asked, after 7 days away | `us-ut-13-72a-203` |
| US-CO | [Colorado AI Act: tell consumers they are interacting with AI](https://leg.colorado.gov/bills/sb24-205)<br><sub>C.R.S. § 6-1-1704 (SB 24-205, as delayed by SB 25B-004)</sub> | 2026-06-30 to 2027-01-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-co-6-1-1704` |
| US-CO | [Conversational AI services: disclose daily, every 3 hours, and when asked (HB 26-1263)](https://leg.colorado.gov/bills/hb26-1263)<br><sub>C.R.S. § 6-1-1708(3) (2026 Sess. Laws ch. 208)</sub> | 2027-01-01 | at the start, when asked, every 3 hours, or a notice shown throughout | `us-co-hb26-1263` |
| US-TX | [TRAIGA: disclose AI in health care and government services (HB 149)](https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm)<br><sub>Tex. Bus. & Com. Code § 552.051</sub> | 2026-01-01 | at the start | `us-tx-552-051` |
| US-NY | [AI companions: notice at the start and every 3 hours](https://www.nysenate.gov/legislation/laws/GBS/1702)<br><sub>N.Y. Gen. Bus. Law § 1702</sub> | 2025-11-05 | at the start, every 3 hours | `us-ny-gbl-1702` |
| US-ME | [Chatbots in trade must not pass as human (LD 1727)](https://legislature.maine.gov/statutes/10/title10sec1500-DD-1.html)<br><sub>10 M.R.S. § 1500-DD</sub> | 2025-09-24 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-me-1500-dd` |
| US-WA | [AI companion chatbots: at the start and every 3 hours (ESHB 2225)](https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/Session%20Laws/House/2225-S.SL.pdf)<br><sub>Laws of 2026, ch. 168</sub> | 2027-01-01 | at the start, when asked, every 3 hours, never claim to be human | `us-wa-hb2225` |
| US-WA | [AI companion chatbots and minors: every hour (ESHB 2225)](https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/Session%20Laws/House/2225-S.SL.pdf)<br><sub>Laws of 2026, ch. 168</sub> | 2027-01-01 | at the start, every 1 hour, never claim to be human | `us-wa-hb2225-minors` |
| US-OR | [AI companions must not pass as human (SB 1546)](https://olis.oregonlegislature.gov/liz/2026R1/Downloads/MeasureDocument/SB1546/Enrolled)<br><sub>Or. Laws 2026, ch. 85, § 1</sub> | 2027-01-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-or-sb1546` |
| US-CT | [AI companions: notice, static or at intervals (Public Act 26-15)](https://www.cga.ct.gov/2026/ACT/PA/PDF/2026PA-00015-R00SB-00005-PA.PDF)<br><sub>Conn. Pub. Act 26-15, § 5</sub> | 2027-01-01 | at the start, when asked, every 3 hours, or a notice shown throughout, never claim to be human, if a reasonable person could think it is human | `us-ct-pa26-15-5` |
| US-CT | [Automated employment decision technology: tell applicants and employees](https://www.cga.ct.gov/2026/ACT/PA/PDF/2026PA-00015-R00SB-00005-PA.PDF)<br><sub>Conn. Pub. Act 26-15, § 9</sub> | 2027-10-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-ct-pa26-15-9` |
| US-NE | [Conversational AI Safety Act (LB 525)](https://nebraskalegislature.gov/FloorDocs/109/PDF/Slip/LB525.pdf)<br><sub>Neb. LB 525 (2026), § 15</sub> | 2027-07-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-ne-lb525` |
| US-ID | [Conversational AI Safety Act (S 1297)](https://legislature.idaho.gov/wp-content/uploads/sessioninfo/2026/legislation/S1297E1.pdf)<br><sub>Idaho Code § 48-2103(1)</sub> | 2027-07-01 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-id-48-2103` |
| US-ID | [Conversational AI and minors: persistent, or each session and every 3 hours (S 1297)](https://legislature.idaho.gov/wp-content/uploads/sessioninfo/2026/legislation/S1297E1.pdf)<br><sub>Idaho Code § 48-2104(1)</sub> | 2027-07-01 | at the start, every 3 hours, or a notice shown throughout, never claim to be human | `us-id-48-2104` |
| US-IA | [Conversational AI services: persistent, or every 3 hours (SF 2417)](https://www.legis.iowa.gov/docs/publications/LGE/91/SF2417.pdf)<br><sub>Iowa Code § 554J.3</sub> | 2027-07-01 | every 3 hours, or a notice shown throughout, if a reasonable person could think it is human | `us-ia-554j-3` |
| US-GA | [AI companion chatbots: each session and every 3 hours (SB 540)](https://www.legis.ga.gov/api/legislation/document/20252026/248169)<br><sub>O.C.G.A. § 39-5-6(b)-(c) (2026 Ga. Act 518)</sub> | 2027-07-01 | at the start, every 3 hours | `us-ga-39-5-6` |
| US-HI | [AI companions must not pass as human (SB 3001)](https://data.capitol.hawaii.gov/sessions/session2026/bills/SB3001_CD1_.HTM)<br><sub>HRS ch. 481B, new section (a) (2026 Act 248)</sub> | 2026-07-14 | at the start, when asked, never claim to be human, if a reasonable person could think it is human | `us-hi-act-248` |
| US-HI | [AI companions and minors: persistent, or each session and every hour (SB 3001)](https://data.capitol.hawaii.gov/sessions/session2026/bills/SB3001_CD1_.HTM)<br><sub>HRS ch. 481B, new section (b) (2026 Act 248)</sub> | 2026-07-14 | at the start, every 1 hour, or a notice shown throughout | `us-hi-act-248-minors` |
| US-RI | [AI companions: at the start and every 3 hours](https://webserver.rilegislature.gov/BillText26/HouseText26/H7350Aaa.htm)<br><sub>R.I. Gen. Laws § 6-63-3</sub> | 2027-01-01 | at the start, every 3 hours | `us-ri-6-63-3` |
| EU | [AI Act: tell people they are interacting with an AI system](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)<br><sub>Regulation (EU) 2024/1689, Art. 50(1) and 50(5)</sub> | 2026-08-02 | at the start, or a notice shown throughout, never claim to be human, if a reasonable person could think it is human | `eu-ai-act-50-1` |
| EU | [AI Act: machine-readable marking of AI-generated content](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)<br><sub>Regulation (EU) 2024/1689, Art. 50(2); Art. 111(4) as inserted by Regulation (EU) 2026/1744</sub> | 2026-08-02 | Mark every output in a machine-readable format, such as metadata or a watermark, so it can be detected as AI-generated. | `eu-ai-act-50-2` |
| EU | [AI Act: tell people about emotion recognition or biometric categorisation](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)<br><sub>Regulation (EU) 2024/1689, Art. 50(3)</sub> | 2026-08-02 | Tell people exposed to the system that it is operating, at the latest at first exposure. | `eu-ai-act-50-3` |
| EU | [AI Act: disclose deep fakes](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)<br><sub>Regulation (EU) 2024/1689, Art. 50(4), first subparagraph</sub> | 2026-08-02 | Disclose that the content is artificially generated or manipulated, at the latest at first exposure. | `eu-ai-act-50-4-deepfake` |
| EU | [AI Act: disclose AI-written text published on matters of public interest](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)<br><sub>Regulation (EU) 2024/1689, Art. 50(4), second subparagraph</sub> | 2026-08-02 | Disclose that the text was artificially generated or manipulated, unless a person reviewed it and someone holds editorial responsibility. | `eu-ai-act-50-4-text` |
| UK | [PECR: automated marketing calls need specific prior consent](https://www.legislation.gov.uk/uksi/2003/2426/regulation/19)<br><sub>Privacy and Electronic Communications (EC Directive) Regulations 2003, SI 2003/2426, reg 19</sub> | 2003-12-11 | The person must have told you beforehand that they consent to automated marketing calls from you on that line, and the call must show your number. | `uk-pecr-19` |
| UK | [PECR: name the caller on marketing calls](https://www.legislation.gov.uk/uksi/2003/2426/regulation/24)<br><sub>SI 2003/2426, reg 24</sub> | 2003-12-11 | name the business at the start | `uk-pecr-24` |
| UK | [PECR: marketing email and texts must not hide the sender](https://www.legislation.gov.uk/uksi/2003/2426/regulation/23)<br><sub>SI 2003/2426, reg 23</sub> | 2003-12-11 | name the business in every message | `uk-pecr-23` |
| UK | [UK GDPR: information about solely automated significant decisions](https://www.legislation.gov.uk/eur/2016/679/article/22C)<br><sub>UK GDPR Arts 22A-22D, inserted by the Data (Use and Access) Act 2025, s. 80</sub> | 2026-02-05 | Tell the person about the decision, and let them make representations, get human intervention and contest it. | `uk-gdpr-22c` |
| CA | [CRTC rules for automatic dialing-announcing devices](https://crtc.gc.ca/eng/trules-reglest.htm)<br><sub>CRTC Unsolicited Telecommunications Rules, Part IV (Telecom Decision 2007-48, as amended)</sub> | 2008-09-30 | name the business at the start | `ca-crtc-adad` |
| CA | [CASL: identify the sender of commercial electronic messages](https://laws-lois.justice.gc.ca/eng/acts/E-1.6/FullText.html)<br><sub>S.C. 2010, c. 23, s. 6(2); Electronic Commerce Protection Regulations (CRTC), SOR/2012-36, ss. 2-3</sub> | 2014-07-01 | name the business in every message | `ca-casl-6` |
| CA-QC | [Quebec: tell people about decisions made solely by automated processing](https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1)<br><sub>CQLR c. P-39.1, s. 12.1</sub> | 2023-09-22 | Inform the person no later than when you tell them the decision; on request, explain the information, reasons and main factors used; let them submit observations to someone who can review it. | `ca-qc-p39-1-12-1` |
| CA-QC | [Quebec: notice before using technology that can identify, locate or profile](https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1)<br><sub>CQLR c. P-39.1, s. 8.1</sub> | 2023-09-22 | Tell the person first that the technology is used, and how to turn on its identifying, locating or profiling functions. | `ca-qc-p39-1-8-1` |
| CA-ON | [Ontario: say when AI screens job applicants](https://www.ontario.ca/laws/statute/00e41)<br><sub>Employment Standards Act, 2000, S.O. 2000, c. 41, s. 8.4</sub> | 2026-01-01 | A statement in each publicly advertised job posting that AI is used to screen, assess or select applicants. | `ca-on-esa-8-4` |
| AU | [Telemarketing standard: identify the caller; recorded or synthetic voices](https://www.legislation.gov.au/F2017L00323/latest/text)<br><sub>Telecommunications (Telemarketing and Research Calls) Industry Standard 2017 (F2017L00323), ss. 9 and 12</sub> | 2017-03-29 | name the business at the start | `au-telemarketing-std` |
| AU | [Spam Act: identify who authorised a commercial message](https://www.legislation.gov.au/C2004A01214/latest/text)<br><sub>Spam Act 2003 (Cth), s. 17</sub> | 2004-04-10 | name the business in every message | `au-spam-act-17` |
| AU | [Privacy Act: say in your privacy policy where computers make significant decisions](https://www.legislation.gov.au/C2024A00128/asmade/text)<br><sub>Privacy Act 1988, Sch. 1, APP 1.7-1.9 (Privacy and Other Legislation Amendment Act 2024, Sch. 1)</sub> | 2026-12-10 | State in the privacy policy the kinds of personal information used and the kinds of decisions made by computer programs. | `au-app-1-7` |
<!-- rules:end -->

**Not included**, because no law in force requires it: a general "tell people it is a bot"
rule in the UK, Canada or Australia (they have rules on automated calls, sender
identification and automated decisions, which are here). Canada's Bill C-34 would add one
for chatbots; it is at second reading. US bills that were vetoed, died or are pending are
left out too.

**Uncertain, and marked so** (`confidence: 'medium'`): Colorado, where the AI Act's
disclosure runs only until its replacement on 1 January 2027 and a new chatbot law starts
the same day; Utah's mental health chatbot chapter, which may end on 1 July 2027; Rhode
Island's numbering; Quebec's profiling notice.

Found a rule that is wrong, missing or out of date? Open an issue with a link to the
official text.

## Part of AskEleven open source

Small tools for businesses that let software talk to their customers. More at
[github.com/askeleven](https://github.com/askeleven).

MIT licensed.
