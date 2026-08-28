import { completeChat } from './ai.js'
import { createDurableStateStore } from './store.js'
import { loadKnowledge } from './knowledge.js'

export const MARKETING_STAGES = Object.freeze([
  { id: 1, name: 'welcome', goal: 'Welcome the prospect, establish context, and earn permission to continue.' },
  { id: 2, name: 'qualification', goal: 'Confirm fit, role, timing, and whether the conversation is relevant.' },
  { id: 3, name: 'discovery', goal: 'Understand the prospect need, pain point, desired outcome, and constraints.' },
  { id: 4, name: 'value', goal: 'Connect the strongest relevant value proposition to the discovered need.' },
  { id: 5, name: 'solution', goal: 'Present the most relevant solution using verified facts only.' },
  { id: 6, name: 'objection', goal: 'Address concerns clearly, truthfully, and without pressure or dark patterns.' },
  { id: 7, name: 'close', goal: 'Propose one concrete next step such as a demo, meeting, trial, or purchase path.' },
  { id: 8, name: 'end', goal: 'End gracefully, respect opt-out, or hand the conversation to a human.' },
])

const DEFAULT_OPT_OUT = 'Baik. Saya hentikan balasan pemasaran otomatis untuk percakapan ini.'
const DEFAULT_HANDOFF = 'Baik. Saya hentikan balasan otomatis dan meneruskan percakapan ini untuk ditangani manusia.'
const DEFAULT_OPT_IN = 'Baik. Balasan otomatis diaktifkan kembali untuk percakapan ini.'
function envBool(name, fallback = false) { const raw = process.env[name]; if (raw == null || raw === '') return fallback; return /^(1|true|yes|on)$/i.test(raw) }
function envNumber(name, fallback, min, max) { const parsed = Number(process.env[name]); if (!Number.isFinite(parsed)) return fallback; return Math.min(max, Math.max(min, parsed)) }
function clampText(value, limit = 2000) { return String(value ?? '').trim().slice(0, limit) }
function normalizeStage(value, fallback = 1) { const numeric = Number(value); if (!Number.isInteger(numeric) || numeric < 1 || numeric > MARKETING_STAGES.length) return fallback; return numeric }
function normalizeScore(value, fallback = 0) { const numeric = Number(value); if (!Number.isFinite(numeric)) return fallback; return Math.round(Math.min(100, Math.max(0, numeric))) }
function parseJsonObject(text) {
  const raw = String(text ?? '').trim(); if (!raw) return null
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(unfenced) } catch {
    const first = unfenced.indexOf('{'); const last = unfenced.lastIndexOf('}'); if (first < 0 || last <= first) return null
    try { return JSON.parse(unfenced.slice(first, last + 1)) } catch { return null }
  }
}
const OPT_OUT_PATTERNS = [/\bstop\b/i,/\bunsubscribe\b/i,/\bopt[ -]?out\b/i,/\bberhenti\b/i,/jangan\s+(hubungi|chat|pesan|balas)/i,/tidak\s+mau\s+(dihubungi|ditawari)/i]
const OPT_IN_PATTERNS = [/^start$/i,/^mulai\s+lagi$/i,/^lanjutkan\s+(chat|pesan|percakapan)$/i,/^aktifkan\s+(lagi\s+)?balasan$/i]
const HUMAN_HANDOFF_PATTERNS = [/\b(human|person|operator)\b/i,/\bmanusia\b/i,/\badmin\b/i,/bicara\s+(dengan|sama)\s+(orang|sales|cs|admin)/i,/hubungkan\s+(ke|dengan)\s+(sales|cs|admin|manusia)/i]
export function detectControlIntent(text) { const input = clampText(text, 2000); if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(input))) return 'opt_out'; if (OPT_IN_PATTERNS.some((pattern) => pattern.test(input))) return 'opt_in'; if (HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(input))) return 'human_handoff'; return null }

export function getMarketingConfig({ knowledge = loadKnowledge() } = {}) {
  const enabled = envBool('MARKETING_ENABLED', false)
  const companyName = clampText(process.env.MARKETING_COMPANY_NAME, 300)
  const business = clampText(process.env.MARKETING_BUSINESS, 3000)
  const requireKnowledge = envBool('MARKETING_REQUIRE_KNOWLEDGE', false)
  return { enabled, configured: Boolean(enabled && companyName && business && (!requireKnowledge || knowledge.configured)), requireKnowledge, agentName: clampText(process.env.MARKETING_AGENT_NAME || 'AI Assistant', 200), agentRole: clampText(process.env.MARKETING_AGENT_ROLE || 'conversation marketing assistant', 300), companyName, business, valueProposition: clampText(process.env.MARKETING_VALUE_PROPOSITION, 3000), purpose: clampText(process.env.MARKETING_PURPOSE || 'help the prospect decide whether the offering is relevant', 1000), cta: clampText(process.env.MARKETING_CTA || 'offer one useful next step when the prospect is ready', 1000), locale: clampText(process.env.MARKETING_LOCALE || 'id-ID', 40), maxTurns: envNumber('MARKETING_MAX_TURNS', 12, 2, 40), ttlMs: envNumber('MARKETING_SESSION_TTL_MINUTES', 1440, 5, 10080) * 60_000, maxInputChars: envNumber('MAX_INPUT_CHARS', 6000, 500, 20000), optOutMessage: clampText(process.env.MARKETING_OPT_OUT_MESSAGE || DEFAULT_OPT_OUT, 1000), handoffMessage: clampText(process.env.MARKETING_HANDOFF_MESSAGE || DEFAULT_HANDOFF, 1000), optInMessage: clampText(process.env.MARKETING_OPT_IN_MESSAGE || DEFAULT_OPT_IN, 1000) }
}
function stageCatalog() { return MARKETING_STAGES.map((stage) => `${stage.id}. ${stage.name}: ${stage.goal}`).join('\n') }
function historyForPrompt(history) { if (!history.length) return '(no previous turns available in volatile context)'; return history.map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'Prospect'}: ${turn.text}`).join('\n') }
function buildSystemPrompt(config, session, knowledge) {
  const currentStage = MARKETING_STAGES[session.stage - 1]
  return `You are ${config.agentName}, ${config.agentRole} for ${config.companyName}.

Business context:
${config.business}

Verified knowledge facts:
${knowledge.context}

Value proposition:
${config.valueProposition || '(not provided)'}

Conversation purpose:
${config.purpose}

Preferred CTA:
${config.cta}

Locale: ${config.locale}
Channel: WhatsApp inbound conversation
Current stage: ${currentStage.id} (${currentStage.name})

Stages:
${stageCatalog()}

Hard rules:
- Treat the verified knowledge facts and business context as the only factual source for product/company claims.
- If a requested fact is not present, do not guess. Either ask for clarification or set handoff=true when a human answer is appropriate.
- Never invent prices, availability, guarantees, testimonials, discounts, legal claims, product capabilities, inventory, or delivery dates.
- This is an inbound-first assistant. Never imply prior consent when you do not know it.
- Never pretend to be a human. If asked, clearly say you are an AI assistant.
- Understand the need before pushing a product. Ask at most one focused question per message unless the prospect asks for multiple items.
- Keep replies concise, natural, and WhatsApp-friendly.
- Do not use false urgency, guilt, fear, repeated pressure, or manipulative scarcity.
- Respect disinterest and human-handoff requests.
- Move only to the most appropriate immediate stage. It is acceptable to stay in the current stage.
- lead_score is 0-100 and represents observed commercial intent/fit from this conversation only; never infer sensitive traits.
- Output JSON only, with exactly these keys: stage, lead_score, handoff, next_action, reply.

Recent volatile conversation context:
${historyForPrompt(session.history)}`
}
function appendHistory(session, role, text, maxTurns) { const value = clampText(text, 3000); if (!value) return; session.history.push({ role, text: value }); const maxMessages = maxTurns * 2; if (session.history.length > maxMessages) session.history.splice(0, session.history.length - maxMessages) }

export function createMarketingAgent({ complete = completeChat, knowledge = loadKnowledge(), store = createDurableStateStore(), config = getMarketingConfig({ knowledge }), now = () => Date.now() } = {}) {
  const sessions = new Map()
  function cleanupExpired() { const cutoff = now() - config.ttlMs; for (const [jid, session] of sessions.entries()) if (session.updatedAt < cutoff) sessions.delete(jid) }
  function getSession(jid) {
    cleanupExpired(); const key = clampText(jid, 300)
    if (!sessions.has(key)) {
      const persisted = store.get(key) || {}
      sessions.set(key, { stage: normalizeStage(persisted.stage, 1), leadScore: normalizeScore(persisted.leadScore, 0), history: [], optedOut: Boolean(persisted.optedOut), handoff: Boolean(persisted.handoff), nextAction: persisted.nextAction || null, updatedAt: now() })
    }
    return sessions.get(key)
  }
  function persistSession(jid, session) { store.patch(jid, { stage: session.stage, leadScore: session.leadScore, optedOut: session.optedOut, handoff: session.handoff, automationPaused: Boolean(session.optedOut || session.handoff), pauseReason: session.optedOut ? 'opt_out' : session.handoff ? 'human_handoff' : null, nextAction: session.nextAction }) }
  async function processDetailed({ jid, text }) {
    if (!config.enabled) return { reply: null, event: 'disabled', state: null }
    if (!config.configured) throw new Error('Marketing agent is enabled but launch configuration is incomplete')
    const input = clampText(text, config.maxInputChars); if (!input) return { reply: null, event: 'empty', state: null }
    const session = getSession(jid); session.updatedAt = now(); const controlIntent = detectControlIntent(input)
    if (controlIntent === 'opt_out') { appendHistory(session, 'user', input, config.maxTurns); session.optedOut = true; session.handoff = false; session.stage = 8; session.nextAction = 'do_not_automate'; store.setOptOut(jid, true); persistSession(jid, session); return { reply: config.optOutMessage, event: 'opt_out', state: getSessionState(jid) } }
    if (controlIntent === 'opt_in' && session.optedOut) { session.optedOut = false; session.handoff = false; session.stage = 1; session.nextAction = 'resume_with_permission'; store.setOptOut(jid, false); persistSession(jid, session); return { reply: config.optInMessage, event: 'opt_in', state: getSessionState(jid) } }
    if (session.optedOut) return { reply: null, event: 'suppressed_opt_out', state: getSessionState(jid) }
    if (controlIntent === 'human_handoff') { appendHistory(session, 'user', input, config.maxTurns); session.handoff = true; session.stage = 8; session.nextAction = 'human_handoff'; store.setHandoff(jid, true); persistSession(jid, session); return { reply: config.handoffMessage, event: 'human_handoff', state: getSessionState(jid) } }
    if (session.handoff) return { reply: null, event: 'suppressed_handoff', state: getSessionState(jid) }
    appendHistory(session, 'user', input, config.maxTurns)
    const raw = await complete([{ role: 'system', content: buildSystemPrompt(config, session, knowledge) }, { role: 'user', content: input }], { temperature: 0.2 })
    const parsed = parseJsonObject(raw); const reply = clampText(parsed?.reply || raw, 6000); if (!reply) throw new Error('Marketing agent returned no reply text')
    session.stage = normalizeStage(parsed?.stage, session.stage); session.leadScore = normalizeScore(parsed?.lead_score, session.leadScore); session.nextAction = clampText(parsed?.next_action, 500) || null; session.handoff = parsed?.handoff === true; session.updatedAt = now(); if (session.handoff) store.setHandoff(jid, true); appendHistory(session, 'assistant', reply, config.maxTurns); persistSession(jid, session)
    return { reply, event: session.handoff ? 'human_handoff' : 'reply', state: getSessionState(jid) }
  }
  async function process(input) { return (await processDetailed(input)).reply }
  function getStatus() { cleanupExpired(); const durable = store.stats(); return { enabled: config.enabled, configured: config.configured, framework: 'salesgpt-inspired-staged-conversation', activeSessions: sessions.size, optedOutSessions: durable.optedOut, handoffSessions: durable.handoff, sessionPersistence: durable.persistence, verifiedKnowledgeFacts: knowledge.facts.length, knowledgeSource: knowledge.source, knowledgeRequired: config.requireKnowledge, stages: MARKETING_STAGES.length } }
  function getSessionState(jid) {
    const key = clampText(jid, 300)
    const session = sessions.get(key) || (() => { const persisted = store.get(key); if (!persisted) return null; return { stage: normalizeStage(persisted.stage, 1), leadScore: normalizeScore(persisted.leadScore, 0), optedOut: Boolean(persisted.optedOut), handoff: Boolean(persisted.handoff), nextAction: persisted.nextAction || null, history: [] } })()
    if (!session) return null
    return { stage: session.stage, stageName: MARKETING_STAGES[session.stage - 1]?.name || null, leadScore: session.leadScore, optedOut: session.optedOut, handoff: session.handoff, nextAction: session.nextAction, turns: Math.ceil((session.history?.length || 0) / 2) }
  }
  function resumeHumanHandoff(jid) { const session = getSession(jid); session.handoff = false; session.nextAction = 'resume_after_human'; store.resume(jid); persistSession(jid, session); return getSessionState(jid) }
  return { isEnabled: () => config.enabled, process, processDetailed, getStatus, getSessionState, resumeHumanHandoff }
}
