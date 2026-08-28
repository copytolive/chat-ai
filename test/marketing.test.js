import test from 'node:test'
import assert from 'node:assert/strict'
import { createMarketingAgent, detectControlIntent, MARKETING_STAGES } from '../src/marketing.js'

const baseConfig = {
  enabled: true,
  configured: true,
  agentName: 'Nova',
  agentRole: 'conversation marketing assistant',
  companyName: 'Example Co',
  business: 'Example Co provides a simple business software product.',
  valueProposition: 'Helps teams respond faster and organize customer conversations.',
  purpose: 'understand whether the product is relevant to the prospect',
  cta: 'offer a demo when there is clear interest',
  locale: 'id-ID',
  maxTurns: 6,
  ttlMs: 60_000,
  maxInputChars: 6000,
  optOutMessage: 'Opt-out confirmed.',
  handoffMessage: 'Human handoff requested.',
}

test('marketing framework exposes eight staged-sales states', () => {
  assert.equal(MARKETING_STAGES.length, 8)
  assert.deepEqual(MARKETING_STAGES.map((stage) => stage.name), [
    'welcome',
    'qualification',
    'discovery',
    'value',
    'solution',
    'objection',
    'close',
    'end',
  ])
})

test('control intent detects opt-out and human handoff in Indonesian', () => {
  assert.equal(detectControlIntent('tolong berhenti kirim pesan'), 'opt_out')
  assert.equal(detectControlIntent('saya mau bicara dengan admin'), 'human_handoff')
  assert.equal(detectControlIntent('berapa harganya?'), null)
})

test('marketing agent parses structured stage, score, CTA and reply', async () => {
  let systemPrompt = ''
  const complete = async (messages) => {
    systemPrompt = messages[0].content
    return JSON.stringify({
      stage: 3,
      lead_score: 72,
      handoff: false,
      next_action: 'ask_budget',
      reply: 'Boleh tahu kebutuhan utama yang ingin Anda selesaikan?',
    })
  }

  const agent = createMarketingAgent({ complete, config: baseConfig })
  const reply = await agent.process({ jid: 'lead-1', text: 'Saya sedang cari solusi untuk tim sales.' })
  const state = agent.getSessionState('lead-1')

  assert.equal(reply, 'Boleh tahu kebutuhan utama yang ingin Anda selesaikan?')
  assert.equal(state.stage, 3)
  assert.equal(state.stageName, 'discovery')
  assert.equal(state.leadScore, 72)
  assert.equal(state.nextAction, 'ask_budget')
  assert.match(systemPrompt, /context-aware conversation marketing flow/i)
  assert.match(systemPrompt, /Do not use false urgency/i)
})

test('explicit opt-out is deterministic and prevents future AI calls', async () => {
  let calls = 0
  const complete = async () => {
    calls += 1
    return '{"stage":2,"lead_score":20,"handoff":false,"next_action":"qualify","reply":"Hello"}'
  }

  const agent = createMarketingAgent({ complete, config: baseConfig })
  const first = await agent.process({ jid: 'lead-2', text: 'jangan hubungi saya lagi' })
  const second = await agent.process({ jid: 'lead-2', text: 'hello?' })
  const state = agent.getSessionState('lead-2')

  assert.equal(first, 'Opt-out confirmed.')
  assert.equal(second, null)
  assert.equal(calls, 0)
  assert.equal(state.optedOut, true)
  assert.equal(state.stage, 8)
})

test('human handoff is deterministic and suspends automation', async () => {
  let calls = 0
  const complete = async () => {
    calls += 1
    return '{"stage":2,"lead_score":20,"handoff":false,"next_action":"qualify","reply":"Hello"}'
  }

  const agent = createMarketingAgent({ complete, config: baseConfig })
  const first = await agent.process({ jid: 'lead-3', text: 'hubungkan dengan sales manusia' })
  const second = await agent.process({ jid: 'lead-3', text: 'masih ada?' })
  const state = agent.getSessionState('lead-3')

  assert.equal(first, 'Human handoff requested.')
  assert.equal(second, null)
  assert.equal(calls, 0)
  assert.equal(state.handoff, true)
  assert.equal(state.stage, 8)
})
