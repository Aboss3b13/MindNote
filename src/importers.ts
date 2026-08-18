import type { SourceKind } from './types'
const normalize = (text: string) => text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()

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

export async function extractFile(file: File): Promise<{ kind: SourceKind; text: string }> {
  const kind = kindForFile(file)
  const buffer = await file.arrayBuffer()
  let text = ''
  if (kind === 'pdf') text = await extractPdf(buffer)
  else if (kind === 'word' && file.name.toLowerCase().endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser')
    text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value
  }
  else if (kind === 'powerpoint' && file.name.toLowerCase().endsWith('.pptx')) text = await extractPowerPoint(buffer)
  else if (kind === 'spreadsheet') text = await extractSpreadsheet(buffer, file.name)
  else text = new TextDecoder().decode(buffer)
  text = normalize(text)
  if (!text) throw new Error('No readable text was found in this file.')
  return { kind, text }
}

export async function extractRemote(serverUrl: string, token: string, url: string): Promise<{ title: string; text: string; kind: SourceKind }> {
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/extract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ url }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The source could not be imported.')
  return result
}
