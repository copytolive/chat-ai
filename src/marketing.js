import { completeChat } from './ai.js'

export const MARKETING_STAGES = Object.freeze([
  { id: 1, name: 'welcome', goal: 'Welcome the prospect, establish context, and earn permission to continue.' },
  { id: 2, name: 'qualification', goal: 'Confirm fit, role, timing, and whether the conversation is relevant.' },
  { id: 3, name: 'discovery', goal: 'Understand the prospect need, pain point, desired outcome, and constraints.' },
  { id: 4, name: 'value', goal: 'Connect the strongest relevant value proposition to the discovered need.' },
  { id: 5, name: 'solution', goal: 'Present the most relevant solution without inventing unsupported facts.' },
  { id: 6, name: 'objection', goal: 'Address concerns clearly, truthfully, and without pressure or dark patterns.' },
  { id: 7, name: 'close', goal: 'Propose one concrete next step such as a demo, meeting, trial, or purchase path.' },
  { id: 8, name: 'end', goal: 'End gracefully, respect opt-out, or hand the conversation to a human.' },
])

const DEFAULT_OPT_OUT = 'Baik. Saya hentikan balasan pemasaran otomatis untuk percakapan ini.'
const DEFAULT_HANDOFF = 'Baik. Saya hentikan balasan otomatis dan meneruskan percakapan ini untuk ditangani manusia.'

function envBool(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}

function envNumber(name, fallback, min, max) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function clampText(value, limit = 2000) {
  return String(value ?? '').trim().slice(0, limit)
}

function normalizeStage(value, fallback = 1) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MARKETING_STAGES.length) return fallback
  return numeric
}

function normalizeScore(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.round(Math.min(100, Math.max(0, numeric)))
}

function parseJsonObject(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(unfenced)
  } catch {
    const first = unfenced.indexOf('{')
    const last = unfenced.lastIndexOf('}')
    if (first < 0 || last <= first) return null
    try {
      return JSON.parse(unfenced.slice(first, last + 1))
    } catch {
      return null
    }
  }
}

const OPT_OUT_PATTERNS = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bopt[ -]?out\b/i,
  /\bberhenti\b/i,
  /jangan\s+(hubungi|chat|pesan|balas)/i,
  /tidak\s+mau\s+(dihubungi|ditawari)/i,
]

const HUMAN_HANDOFF_PATTERNS = [
  /\b(human|person|operator)\b/i,
  /\bmanusia\b/i,
  /\badmin\b/i,
  /bicara\s+(dengan|sama)\s+(orang|sales|cs|admin)/i,
  /hubungkan\s+(ke|dengan)\s+(sales|cs|admin|manusia)/i,
]

export function detectControlIntent(text) {
  const input = clampText(text, 2000)
  if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(input))) return 'opt_out'
  if (HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(input))) return 'human_handoff'
  return null
}

export function getMarketingConfig() {
  const enabled = envBool('MARKETING_ENABLED', false)
  const companyName = clampText(process.env.MARKETING_COMPANY_NAME, 300)
  const business = clampText(process.env.MARKETING_BUSINESS, 3000)

  return {
    enabled,
    configured: Boolean(enabled && companyName && business),
    agentName: clampText(process.env.MARKETING_AGENT_NAME || 'AI Assistant', 200),
    agentRole: clampText(process.env.MARKETING_AGENT_ROLE || 'conversation marketing assistant', 300),
    companyName,
    business,
    valueProposition: clampText(process.env.MARKETING_VALUE_PROPOSITION, 3000),
    purpose: clampText(process.env.MARKETING_PURPOSE || 'help the prospect decide whether the offering is relevant', 1000),
    cta: clampText(process.env.MARKETING_CTA || 'offer one useful next step when the prospect is ready', 1000),
    locale: clampText(process.env.MARKETING_LOCALE || 'id-ID', 40),
    maxTurns: envNumber('MARKETING_MAX_TURNS', 12, 2, 40),
    ttlMs: envNumber('MARKETING_SESSION_TTL_MINUTES', 1440, 5, 10080) * 60_000,
    maxInputChars: envNumber('MAX_INPUT_CHARS', 6000, 500, 20000),
    optOutMessage: clampText(process.env.MARKETING_OPT_OUT_MESSAGE || DEFAULT_OPT_OUT, 1000),
    handoffMessage: clampText(process.env.MARKETING_HANDOFF_MESSAGE || DEFAULT_HANDOFF, 1000),
  }
}

function stageCatalog() {
  return MARKETING_STAGES.map((stage) => `${stage.id}. ${stage.name}: ${stage.goal}`).join('\n')
}

function historyForPrompt(history) {
  if (!history.length) return '(no previous turns)'
  return history.map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'Prospect'}: ${turn.text}`).join('\n')
}

function buildSystemPrompt(config, session) {
  const currentStage = MARKETING_STAGES[session.stage - 1]
  return `You are ${config.agentName}, ${config.agentRole} for ${config.companyName}.

Business context:
${config.business}

Value proposition:
${config.valueProposition || '(not provided)'}

Conversation purpose:
${config.purpose}

Preferred CTA:
${config.cta}

Locale: ${config.locale}
Channel: WhatsApp inbound conversation

You run a context-aware conversation marketing flow inspired by the proven staged-sales architecture popularized by SalesGPT. The current stage is ${currentStage.id} (${currentStage.name}).

Stages:
${stageCatalog()}

Rules:
- This is an inbound-first assistant. Never imply that the prospect previously consented when you do not know that.
- Never pretend to be a human. If asked, clearly say you are an AI assistant.
- Understand the need before pushing a product. Ask at most one focused question per message unless the user explicitly asks for multiple items.
- Keep replies concise, natural, and WhatsApp-friendly. Avoid long lists unless the prospect asks for one.
- Do not invent prices, availability, guarantees, testimonials, discounts, legal claims, or product capabilities.
- Do not use false urgency, guilt, fear, repeated pressure, or manipulative scarcity.
- Respect disinterest. If a human is needed for an unsupported fact or important decision, set handoff=true.
- Move only to the most appropriate immediate stage. It is acceptable to stay in the current stage.
- lead_score is 0-100 and represents observed commercial intent/fit from this conversation only; do not infer sensitive traits.
- Output JSON only, with no markdown and exactly these keys: stage, lead_score, handoff, next_action, reply.

Previous conversation:
${historyForPrompt(session.history)}`
}

function appendHistory(session, role, text, maxTurns) {
  const value = clampText(text, 3000)
  if (!value) return
  session.history.push({ role, text: value })
  const maxMessages = maxTurns * 2
  if (session.history.length > maxMessages) {
    session.history.splice(0, session.history.length - maxMessages)
  }
}

export function createMarketingAgent({ complete = completeChat, config = getMarketingConfig(), now = () => Date.now() } = {}) {
  const sessions = new Map()

  function cleanupExpired() {
    const cutoff = now() - config.ttlMs
    for (const [jid, session] of sessions.entries()) {
      if (session.updatedAt < cutoff) sessions.delete(jid)
    }
  }

  function getSession(jid) {
    cleanupExpired()
    const key = clampText(jid, 300)
    if (!sessions.has(key)) {
      sessions.set(key, {
        stage: 1,
        leadScore: 0,
        history: [],
        optedOut: false,
        handoff: false,
        nextAction: null,
        updatedAt: now(),
      })
    }
    return sessions.get(key)
  }

  async function process({ jid, text }) {
    if (!config.enabled) return null
    if (!config.configured) {
      throw new Error('Marketing agent is enabled but MARKETING_COMPANY_NAME or MARKETING_BUSINESS is missing')
    }

    const input = clampText(text, config.maxInputChars)
    if (!input) return null
    const session = getSession(jid)
    session.updatedAt = now()

    const controlIntent = detectControlIntent(input)
    if (controlIntent === 'opt_out') {
      appendHistory(session, 'user', input, config.maxTurns)
      session.optedOut = true
      session.stage = 8
      session.nextAction = 'do_not_automate'
      return config.optOutMessage
    }

    if (session.optedOut) return null

    if (controlIntent === 'human_handoff') {
      appendHistory(session, 'user', input, config.maxTurns)
      session.handoff = true
      session.stage = 8
      session.nextAction = 'human_handoff'
      return config.handoffMessage
    }

    if (session.handoff) return null

    appendHistory(session, 'user', input, config.maxTurns)
    const raw = await complete([
      { role: 'system', content: buildSystemPrompt(config, session) },
      { role: 'user', content: input },
    ], { temperature: 0.25 })

    const parsed = parseJsonObject(raw)
    const reply = clampText(parsed?.reply || raw, 6000)
    if (!reply) throw new Error('Marketing agent returned no reply text')

    session.stage = normalizeStage(parsed?.stage, session.stage)
    session.leadScore = normalizeScore(parsed?.lead_score, session.leadScore)
    session.nextAction = clampText(parsed?.next_action, 500) || null
    session.handoff = parsed?.handoff === true
    session.updatedAt = now()
    appendHistory(session, 'assistant', reply, config.maxTurns)

    return reply
  }

  function getStatus() {
    cleanupExpired()
    let optedOutSessions = 0
    let handoffSessions = 0
    for (const session of sessions.values()) {
      if (session.optedOut) optedOutSessions += 1
      if (session.handoff) handoffSessions += 1
    }
    return {
      enabled: config.enabled,
      configured: config.configured,
      framework: 'salesgpt-inspired-staged-conversation',
      activeSessions: sessions.size,
      optedOutSessions,
      handoffSessions,
      sessionPersistence: 'memory-only',
      stages: MARKETING_STAGES.length,
    }
  }

  function getSessionState(jid) {
    const session = sessions.get(clampText(jid, 300))
    if (!session) return null
    return {
      stage: session.stage,
      stageName: MARKETING_STAGES[session.stage - 1]?.name || null,
      leadScore: session.leadScore,
      optedOut: session.optedOut,
      handoff: session.handoff,
      nextAction: session.nextAction,
      turns: Math.ceil(session.history.length / 2),
    }
  }

  return {
    isEnabled: () => config.enabled,
    process,
    getStatus,
    getSessionState,
  }
}
