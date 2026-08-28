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

export function getAIStatus() {
  const enabled = envBool('AI_ENABLED', false)
  const baseUrl = (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, '')
  const model = (process.env.AI_MODEL || '').trim()
  return {
    enabled,
    configured: Boolean(enabled && baseUrl && model),
    baseUrl: baseUrl || null,
    model: model || null,
    apiKeyConfigured: Boolean((process.env.AI_API_KEY || '').trim()),
  }
}

export async function generateReply(userText) {
  const status = getAIStatus()
  if (!status.enabled) return null
  if (!status.configured) {
    throw new Error('AI is enabled but AI_BASE_URL or AI_MODEL is missing')
  }

  const maxInput = Number(process.env.MAX_INPUT_CHARS || 6000)
  const maxReply = Number(process.env.MAX_REPLY_CHARS || 6000)
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000)
  const prompt = clampText(userText, maxInput)
  if (!prompt) return null

  const systemPrompt = (process.env.SYSTEM_PROMPT || 'You are a helpful WhatsApp assistant. Reply clearly and concisely.').trim()
  const headers = { 'content-type': 'application/json' }
  const apiKey = (process.env.AI_API_KEY || '').trim()
  if (apiKey) headers.authorization = `Bearer ${apiKey}`

  const response = await fetch(`${status.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: status.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
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
