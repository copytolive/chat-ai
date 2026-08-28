const els = {
  badge: document.querySelector('#badge'),
  waState: document.querySelector('#wa-state'),
  aiState: document.querySelector('#ai-state'),
  aiModel: document.querySelector('#ai-model'),
  waAccount: document.querySelector('#wa-account'),
  qrWrap: document.querySelector('#qr-wrap'),
  qrHelp: document.querySelector('#qr-help'),
  lastUpdated: document.querySelector('#last-updated'),
}

let lastQr = null
let scannerToken = sessionStorage.getItem('chat-ai-scanner-token') || ''

function labelForConnection(connection) {
  return String(connection || 'unknown').replaceAll('_', ' ').toUpperCase()
}

function authHeaders() {
  return scannerToken ? { 'x-scanner-token': scannerToken } : {}
}

async function getJson(url, retryAuth = true) {
  const response = await fetch(url, { cache: 'no-store', headers: authHeaders() })
  if (response.status === 401 && retryAuth) {
    const entered = window.prompt('Scanner token required')
    if (entered) {
      scannerToken = entered.trim()
      sessionStorage.setItem('chat-ai-scanner-token', scannerToken)
      return getJson(url, false)
    }
  }
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

function renderStatus(payload) {
  const wa = payload.whatsapp || {}
  const ai = payload.ai || {}
  const connection = wa.connection || 'unknown'

  els.waState.textContent = labelForConnection(connection)
  els.aiState.textContent = ai.configured ? 'READY' : ai.enabled ? 'MISCONFIGURED' : 'DISABLED'
  els.aiModel.textContent = ai.model || '—'
  els.waAccount.textContent = wa.accountPaired ? 'PAIRED' : '—'
  els.badge.textContent = connection === 'open' ? 'CONNECTED' : connection === 'qr' ? 'SCAN QR' : labelForConnection(connection)
  els.badge.dataset.state = connection
  els.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`
}

async function refreshQr(status) {
  if (status?.whatsapp?.connection === 'open') {
    lastQr = null
    els.qrWrap.innerHTML = '<div class="success">Connected</div>'
    els.qrHelp.textContent = 'WhatsApp is connected. Incoming accepted text can now be processed.'
    return
  }

  if (!status?.whatsapp?.hasQr) {
    lastQr = null
    els.qrWrap.innerHTML = '<div class="placeholder">Waiting for a fresh QR…</div>'
    els.qrHelp.textContent = 'The service is connecting. QR codes expire and refresh automatically.'
    return
  }

  const { response, payload } = await getJson('/qr')
  if (!response.ok || !payload.qr) return
  if (payload.qr === lastQr) return
  lastQr = payload.qr

  const img = document.createElement('img')
  img.src = payload.qr
  img.alt = 'WhatsApp pairing QR code'
  img.width = 360
  img.height = 360
  els.qrWrap.replaceChildren(img)
  els.qrHelp.textContent = 'Open WhatsApp → Linked devices → Link a device, then scan this QR.'
}

async function refresh() {
  try {
    const { response, payload } = await getJson('/status')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    renderStatus(payload)
    await refreshQr(payload)
  } catch (error) {
    els.badge.textContent = 'OFFLINE'
    els.badge.dataset.state = 'error'
    els.lastUpdated.textContent = `Status error: ${error.message}`
  }
}

refresh()
setInterval(refresh, 2500)
