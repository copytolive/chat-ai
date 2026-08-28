function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function createMetrics({ maxSamples = 1000 } = {}) {
  const counters = { messagesReceived: 0, repliesSent: 0, failures: 0, handoffs: 0, optOuts: 0, duplicateMessages: 0 }
  const latencies = []
  const startedAt = Date.now()
  function inc(name, by = 1) { if (!(name in counters)) counters[name] = 0; counters[name] += by }
  function observeLatency(ms) {
    const value = Math.max(0, Math.round(Number(ms) || 0))
    latencies.push(value)
    if (latencies.length > maxSamples) latencies.splice(0, latencies.length - maxSamples)
  }
  function snapshot() {
    return { ...counters, p50LatencyMs: percentile(latencies, 50), p95LatencyMs: percentile(latencies, 95), latencySamples: latencies.length, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }
  }
  return { inc, observeLatency, snapshot }
}
