function envBool(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}
function clampText(value, limit) {
  const text = String(value ?? '').trim()
  if (!Number.isFinite(limit) || limit <= 0) return text
  return text.slice(0, limit)
}
function endpoint(prefix = 'AI') {
  return { baseUrl: String(process.env[`${prefix}_BASE_URL`] || '').trim().replace(/\/+$/, ''), model: String(process.env[`${prefix}_MODEL`] || '').trim(), apiKey: String(process.env[`${prefix}_API_KEY`] || '').trim() }
}
function getAIConfig() { return { enabled: envBool('AI_ENABLED', false), primary: endpoint('AI'), fallback: endpoint('AI_FALLBACK') } }
export function getAIStatus() {
  const config = getAIConfig()
  const fallbackConfigured = Boolean(config.fallback.baseUrl && config.fallback.model)
  return { enabled: config.enabled, configured: Boolean(config.enabled && config.primary.baseUrl && config.primary.model), model: config.primary.model || null, apiKeyConfigured: Boolean(config.primary.apiKey), fallbackConfigured, fallbackModel: fallbackConfigured ? config.fallback.model : null }
}
async function callEndpoint(target, safeMessages, { temperature, timeoutMs, maxReply }) {
  const headers = { 'content-type': 'application/json' }
  if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`
  const response = await fetch(`${target.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: target.model, messages: safeMessages, temperature }), signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    const detail = clampText(await response.text(), 500)
    throw new Error(`AI endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  const payload = await response.json()
  const reply = payload?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('AI endpoint returned no assistant text')
  return clampText(reply, maxReply)
}
export async function completeChat(messages, { temperature = 0.2, maxReplyChars } = {}) {
  const config = getAIConfig()
  if (!config.enabled) return null
  if (!config.primary.baseUrl || !config.primary.model) throw new Error('AI is enabled but AI_BASE_URL or AI_MODEL is missing')
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60_000)
  const maxReply = Number(maxReplyChars || process.env.MAX_REPLY_CHARS || 6000)
  const safeMessages = (Array.isArray(messages) ? messages : []).filter((message) => message && typeof message.content === 'string').map((message) => ({ role: ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user', content: clampText(message.content, 20_000) }))
  if (!safeMessages.length) return null
  try { return await callEndpoint(config.primary, safeMessages, { temperature, timeoutMs, maxReply }) }
  catch (primaryError) {
    if (!config.fallback.baseUrl || !config.fallback.model) throw primaryError
    try { return await callEndpoint(config.fallback, safeMessages, { temperature, timeoutMs, maxReply }) }
    catch (fallbackError) { throw new AggregateError([primaryError, fallbackError], 'Primary and fallback AI endpoints failed') }
  }
}
export async function generateReply(userText) {
  const maxInput = Number(process.env.MAX_INPUT_CHARS || 6000)
  const prompt = clampText(userText, maxInput)
  if (!prompt) return null
  const systemPrompt = String(process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Reply clearly and concisely.').trim()
  return completeChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], { temperature: 0.2 })
}
