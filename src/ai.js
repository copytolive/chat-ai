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

function getAIConfig() {
  const enabled = envBool('AI_ENABLED', false)
  const baseUrl = (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, '')
  const model = (process.env.AI_MODEL || '').trim()
  return {
    enabled,
    baseUrl,
    model,
    apiKey: (process.env.AI_API_KEY || '').trim(),
  }
}

export function getAIStatus() {
  const config = getAIConfig()
  return {
    enabled: config.enabled,
    configured: Boolean(config.enabled && config.baseUrl && config.model),
    model: config.model || null,
    apiKeyConfigured: Boolean(config.apiKey),
  }
}

export async function completeChat(messages, { temperature = 0.2, maxReplyChars } = {}) {
  const config = getAIConfig()
  if (!config.enabled) return null
  if (!config.baseUrl || !config.model) {
    throw new Error('AI is enabled but AI_BASE_URL or AI_MODEL is missing')
  }

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000)
  const maxReply = Number(maxReplyChars || process.env.MAX_REPLY_CHARS || 6000)
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      role: ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user',
      content: clampText(message.content, 20000),
    }))

  if (!safeMessages.length) return null

  const headers = { 'content-type': 'application/json' }
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: safeMessages,
      temperature,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const detail = clampText(await response.text(), 500)
    throw new Error(`AI endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const payload = await response.json()
  const reply = payload?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('AI endpoint returned no assistant text')
  }

  return clampText(reply, maxReply)
}

export async function generateReply(userText) {
  const maxInput = Number(process.env.MAX_INPUT_CHARS || 6000)
  const prompt = clampText(userText, maxInput)
  if (!prompt) return null

  const systemPrompt = (process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Reply clearly and concisely.').trim()
  return completeChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ], { temperature: 0.2 })
}
