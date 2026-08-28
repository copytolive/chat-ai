import test from 'node:test'
import assert from 'node:assert/strict'
import { extractText } from '../src/wa.js'

test('extracts plain conversation text', () => {
  assert.equal(extractText({ message: { conversation: 'hello' } }), 'hello')
})

test('extracts extended text', () => {
  assert.equal(extractText({ message: { extendedTextMessage: { text: 'reply text' } } }), 'reply text')
})

test('extracts media captions', () => {
  assert.equal(extractText({ message: { imageMessage: { caption: 'image caption' } } }), 'image caption')
  assert.equal(extractText({ message: { videoMessage: { caption: 'video caption' } } }), 'video caption')
})

test('returns empty string for unsupported or empty messages', () => {
  assert.equal(extractText({}), '')
  assert.equal(extractText({ message: { reactionMessage: {} } }), '')
})
