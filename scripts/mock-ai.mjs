import http from 'node:http'

const port = Number(process.env.MOCK_AI_PORT || 9999)
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404); return res.end() }
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    const latest = body.messages?.at(-1)?.content || ''
    const content = JSON.stringify({ stage: 3, lead_score: 42, handoff: false, next_action: 'ask_one_discovery_question', reply: `Mock validated reply for: ${String(latest).slice(0, 80)}` })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
})
server.listen(port, '127.0.0.1', () => console.log(`mock-ai:${port}`))
