const base = process.env.LAUNCH_BASE_URL || 'http://127.0.0.1:3847'
const scannerToken = process.env.SCANNER_TOKEN || ''
const headers = scannerToken ? { 'x-scanner-token': scannerToken } : {}

async function check(path, expected = 200) {
  const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(5000) })
  const body = await response.json().catch(() => ({}))
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status} ${JSON.stringify(body)}`)
  return body
}

const health = await check('/health')
const ready = await check('/ready')
const status = await check('/status')
if (!health.ok || !ready.ok || !status.ok) throw new Error('Launch doctor received non-ok payload')
if (status.whatsapp?.provider !== 'cloud') throw new Error('Production launch doctor requires WhatsApp Cloud provider')
if (!status.automation?.enabled) throw new Error('Automation kill switch is OFF')
if (!status.ai?.configured) throw new Error('AI is not configured')
if (!status.marketing?.configured) throw new Error('Marketing agent is not configured')
if (!String(status.marketing?.sessionPersistence || '').startsWith('durable-')) throw new Error('Durable suppression persistence is not active')
console.log(JSON.stringify({ ok: true, release: status.release, provider: status.whatsapp.provider, marketing: status.marketing.framework, knowledgeFacts: status.marketing.verifiedKnowledgeFacts }, null, 2))
