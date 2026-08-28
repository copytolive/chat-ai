import fs from 'node:fs'
import path from 'node:path'

function clamp(value, max = 12000) { return String(value ?? '').trim().slice(0, max) }
function normalizeFacts(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item : item?.fact).map((item) => clamp(item, 1200)).filter(Boolean).slice(0, 200)
}

export function loadKnowledge({ filePath = process.env.KNOWLEDGE_FILE || '' } = {}) {
  const envFacts = normalizeFacts(String(process.env.KNOWLEDGE_FACTS || '').split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean))
  let fileFacts = []
  let source = envFacts.length ? 'env' : 'none'
  if (filePath) {
    const resolved = path.resolve(filePath)
    try {
      const raw = fs.readFileSync(resolved, 'utf8')
      const parsed = JSON.parse(raw)
      fileFacts = normalizeFacts(parsed?.facts || parsed)
      if (fileFacts.length) source = 'file'
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const facts = [...fileFacts, ...envFacts].slice(0, 200)
  return { facts, source, configured: facts.length > 0, context: facts.length ? facts.map((fact, index) => `${index + 1}. ${fact}`).join('\n') : '(no verified knowledge facts configured)' }
}
