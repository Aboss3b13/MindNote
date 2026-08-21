import type { SourceKind } from './types'
import { Capacitor } from '@capacitor/core'
const normalize = (text: string) => text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
const apiUrl = (file: string) => Capacitor.isNativePlatform() ? `https://abbas.ali-raza.net/Mindnotes/api/${file}` : `./api/${file}`

export function kindForFile(file: File): SourceKind {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext || '')) return 'word'
  if (['ppt', 'pptx', 'odp'].includes(ext || '')) return 'powerpoint'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext || '')) return 'spreadsheet'
  if (['txt', 'md', 'markdown', 'json', 'html', 'htm', 'xml'].includes(ext || '')) return 'text'
  return 'file'
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
  }
  return pages.join('\n\n')
}

async function extractPowerPoint(buffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const slides: string[] = []
  for (const [index, name] of slideFiles.entries()) {
    const xml = await zip.file(name)!.async('text')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const text = [...doc.getElementsByTagNameNS('*', 't')].map((node) => node.textContent || '').join(' ')
    slides.push(`Slide ${index + 1}\n${text}`)
  }
  return slides.join('\n\n')
}

async function extractSpreadsheet(buffer: ArrayBuffer, fileName: string): Promise<string> {
  if (fileName.toLowerCase().endsWith('.csv')) return new TextDecoder().decode(buffer)
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const sharedFile = zip.file('xl/sharedStrings.xml')
  const shared: string[] = []
  if (sharedFile) {
    const xml = new DOMParser().parseFromString(await sharedFile.async('text'), 'application/xml')
    ;[...xml.getElementsByTagNameNS('*', 'si')].forEach((item) => shared.push([...item.getElementsByTagNameNS('*', 't')].map((node) => node.textContent || '').join('')))
  }
  const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}))
  if (!sheets.length) throw new Error('This spreadsheet format is not supported on-device. Save it as XLSX or CSV and try again.')
  const output: string[] = []
  for (const [index, name] of sheets.entries()) {
    const xml = new DOMParser().parseFromString(await zip.file(name)!.async('text'), 'application/xml')
    const rows = [...xml.getElementsByTagNameNS('*', 'row')].map((row) => [...row.getElementsByTagNameNS('*', 'c')].map((cell) => {
      const value = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent || ''
      return cell.getAttribute('t') === 's' ? shared[Number(value)] || '' : value
    }).join('\t'))
    output.push(`Sheet ${index + 1}\n${rows.join('\n')}`)
  }
  return output.join('\n\n')
}

async function extractOpenDocument(buffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const content = zip.file('content.xml')
  if (!content) throw new Error('This document does not contain readable OpenDocument text.')
  const xml = new DOMParser().parseFromString(await content.async('text'), 'application/xml')
  return [...xml.querySelectorAll('text\\:p, text\\:h, table\\:table-cell, draw\\:text-box')].map((node) => node.textContent || '').filter(Boolean).join('\n') || xml.documentElement.textContent || ''
}

function extractMarkup(text: string, type: DOMParserSupportedType = 'text/html') {
  const document = new DOMParser().parseFromString(text, type)
  document.querySelectorAll('script,style,noscript,svg').forEach((node) => node.remove())
  return document.body?.innerText || document.documentElement.textContent || ''
}

function extractRtf(text: string) {
  return text.replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/\\(?:par|line)\b/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '')
}

export async function extractFile(file: File): Promise<{ kind: SourceKind; text: string }> {
  const kind = kindForFile(file)
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const buffer = await file.arrayBuffer()
  let text = ''
  if (kind === 'pdf') text = await extractPdf(buffer)
  else if (kind === 'word' && extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser')
    text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value
  }
  else if (['odt', 'odp', 'ods'].includes(extension)) text = await extractOpenDocument(buffer)
  else if (kind === 'powerpoint' && extension === 'pptx') text = await extractPowerPoint(buffer)
  else if (kind === 'spreadsheet') text = await extractSpreadsheet(buffer, file.name)
  else if (['txt','md','markdown','csv','json'].includes(extension)) text = new TextDecoder().decode(buffer)
  else if (['html','htm'].includes(extension)) text = extractMarkup(new TextDecoder().decode(buffer))
  else if (extension === 'xml') text = extractMarkup(new TextDecoder().decode(buffer), 'application/xml')
  else if (extension === 'rtf') text = extractRtf(new TextDecoder().decode(buffer))
  else throw new Error('This file needs server extraction. Supported formats include PDF, Word, PowerPoint, Excel, OpenDocument, CSV, HTML, XML, Markdown, JSON, and plain text.')
  text = normalize(text)
  if (!text) throw new Error('No readable text was found in this file.')
  return { kind, text }
}

export async function extractRemote(url: string): Promise<{ title: string; text: string; kind: SourceKind }> {
  const response = await fetch(apiUrl('extract.php'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The source could not be imported.')
  return result
}

export async function extractFileOnServer(file: File): Promise<{ title: string; text: string; kind: SourceKind }> {
  const form = new FormData(); form.append('file', file)
  const response = await fetch(apiUrl('extract-file.php'), { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The file could not be read.')
  return result
}
