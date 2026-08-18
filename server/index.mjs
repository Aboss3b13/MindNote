import express from 'express'
import cors from 'cors'
import * as cheerio from 'cheerio'
import { YoutubeTranscript } from 'youtube-transcript'
import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isIP } from 'node:net'
import dns from 'node:dns/promises'

const app = express()
const port = Number(process.env.MINDNOTES_PORT || 4317)
const token = process.env.MINDNOTES_ACCESS_TOKEN || ''
const allowedOrigin = process.env.MINDNOTES_ALLOWED_ORIGIN || 'http://localhost:5173'
const dataFile = resolve(process.env.MINDNOTES_DATA_DIR || './server/data', 'workspace.json')
if (!token || token.length < 24) { console.error('Set MINDNOTES_ACCESS_TOKEN to a random secret of at least 24 characters.'); process.exit(1) }

app.disable('x-powered-by')
app.use(cors({ origin: allowedOrigin.split(',').map((item) => item.trim()) }))
app.use(express.json({ limit: '20mb' }))
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'Not authorized.' })
  next()
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/workspace', async (_req, res) => {
  try { res.json(JSON.parse(await fs.readFile(dataFile, 'utf8'))) }
  catch (error) { if (error.code === 'ENOENT') res.status(404).json({ error: 'No server backup exists yet.' }); else res.status(500).json({ error: 'Could not read the workspace.' }) }
})
app.put('/api/workspace', async (req, res) => {
  if (!validWorkspace(req.body)) return res.status(400).json({ error: 'Invalid workspace data.' })
  const payload = JSON.stringify({ ...req.body, updatedAt: new Date().toISOString() })
  await fs.mkdir(dirname(dataFile), { recursive: true, mode: 0o700 })
  const temp = `${dataFile}.tmp`; await fs.writeFile(temp, payload, { mode: 0o600 }); await fs.rename(temp, dataFile)
  res.json({ ok: true })
})
app.post('/api/extract', async (req, res) => {
  try {
    const url = new URL(String(req.body?.url || ''))
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS sources are supported.')
    if (isYouTube(url)) {
      const rows = await YoutubeTranscript.fetchTranscript(url.toString())
      const text = rows.map((row) => row.text).join(' ').replace(/&amp;/g, '&')
      if (!text) throw new Error('No public transcript is available for this video.')
      return res.json({ title: `YouTube · ${url.searchParams.get('v') || url.pathname.split('/').pop()}`, text, kind: 'youtube' })
    }
    const response = await safeFetch(url)
    if (!response.ok) throw new Error(`The website responded with ${response.status}.`)
    const type = response.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('text/plain') && !type.includes('application/json')) throw new Error('This URL is not a readable webpage. Upload the source file instead.')
    const html = await response.text(); if (html.length > 12_000_000) throw new Error('This webpage is too large to import.')
    const $ = cheerio.load(html); $('script,style,noscript,svg,nav,footer').remove()
    const title = $('title').first().text().trim() || url.hostname
    const text = ($('main,article').first().text() || $('body').text()).replace(/\s+/g, ' ').trim()
    if (!text) throw new Error('No readable text was found on this page.')
    res.json({ title, text, kind: 'url' })
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'The source could not be extracted.' }) }
})

function validWorkspace(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || !Array.isArray(value.folders) || !Array.isArray(value.sources)) return false
  if (value.notes.length > 100000 || value.sources.length > 10000) return false
  return JSON.stringify(value).length <= 20_000_000
}
function isYouTube(url) { return ['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(url.hostname) }
function privateAddress(address) {
  if (address === '::1' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true
  const parts = address.split('.').map(Number)
  return parts.length === 4 && (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168))
}
async function safeFetch(initialUrl) {
  let current = initialUrl
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const records = await dns.lookup(current.hostname, { all: true })
    if (!records.length || records.some((record) => privateAddress(record.address) || !isIP(record.address))) throw new Error('Private network addresses cannot be imported.')
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'MindNotes Source Importer/0.1' } })
    if (![301,302,303,307,308].includes(response.status)) return response
    const location = response.headers.get('location'); if (!location) return response
    current = new URL(location, current); if (!['http:','https:'].includes(current.protocol)) throw new Error('Unsupported redirect.')
  }
  throw new Error('Too many redirects.')
}

app.listen(port, '127.0.0.1', () => console.log(`MindNotes backend listening on 127.0.0.1:${port}`))
