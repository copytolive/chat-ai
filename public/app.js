const els = {
  badge: document.querySelector('#badge'),
  waState: document.querySelector('#wa-state'),
  aiState: document.querySelector('#ai-state'),
  aiModel: document.querySelector('#ai-model'),
  marketingState: document.querySelector('#marketing-state'),
  marketingSessions: document.querySelector('#marketing-sessions'),
  waAccount: document.querySelector('#wa-account'),
  qrWrap: document.querySelector('#qr-wrap'),
  qrHelp: document.querySelector('#qr-help'),
  previewForm: document.querySelector('#preview-form'),
  previewSession: document.querySelector('#preview-session'),
  previewInput: document.querySelector('#preview-input'),
  previewSubmit: document.querySelector('#preview-submit'),
  previewOutput: document.querySelector('#preview-output'),
  previewStage: document.querySelector('#preview-stage'),
  lastUpdated: document.querySelector('#last-updated'),
}

let lastQr = null
let scannerToken = sessionStorage.getItem('chat-ai-scanner-token') || ''

function labelForConnection(connection) {
  return String(connection || 'unknown').replaceAll('_', ' ').toUpperCase()
}

function authHeaders(extra = {}) {
  return scannerToken ? { ...extra, 'x-scanner-token': scannerToken } : extra
}

async function requestJson(url, options = {}, retryAuth = true) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: authHeaders(options.headers || {}),
  })

  if (response.status === 401 && retryAuth) {
    const entered = window.prompt('Scanner token required')
    if (entered) {
      scannerToken = entered.trim()
      sessionStorage.setItem('chat-ai-scanner-token', scannerToken)
      return requestJson(url, options, false)
    }
  }

  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

function getJson(url) {
  return requestJson(url)
}

function postJson(url, body) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function renderStatus(payload) {
  const wa = payload.whatsapp || {}
  const ai = payload.ai || {}
  const marketing = payload.marketing || {}
  const connection = wa.connection || 'unknown'

  els.waState.textContent = labelForConnection(connection)
  els.aiState.textContent = ai.configured ? 'READY' : ai.enabled ? 'MISCONFIGURED' : 'DISABLED'
  els.aiModel.textContent = ai.model || '—'
  els.marketingState.textContent = marketing.configured ? 'READY' : marketing.enabled ? 'MISCONFIGURED' : 'DISABLED'
  els.marketingSessions.textContent = Number.isFinite(marketing.activeSessions) ? String(marketing.activeSessions) : '—'
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

els.previewForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = els.previewInput.value.trim()
  if (!text) return

  els.previewSubmit.disabled = true
  els.previewSubmit.textContent = 'Thinking…'
  els.previewOutput.textContent = 'Processing…'

  try {
    const { response, payload } = await postJson('/marketing/preview', {
      sessionId: els.previewSession.value.trim() || 'demo',
      text,
    })

    if (!response.ok) {
      const error = payload.error || `HTTP ${response.status}`
      throw new Error(error)
    }

    els.previewOutput.textContent = payload.reply || '(automation paused)'
    const stageName = payload.state?.stageName || 'paused'
    const score = Number.isFinite(payload.state?.leadScore) ? ` · ${payload.state.leadScore}/100` : ''
    els.previewStage.textContent = `${stageName.toUpperCase()}${score}`
    els.previewInput.value = ''
    await refresh()
  } catch (error) {
    els.previewOutput.textContent = `Preview error: ${error.message}`
    els.previewStage.textContent = 'ERROR'
  } finally {
    els.previewSubmit.disabled = false
    els.previewSubmit.textContent = 'Send to agent'
  }
})

refresh()
setInterval(refresh, 2500)
