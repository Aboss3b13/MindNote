import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, Focus, HelpCircle, Maximize2, Search, X } from 'lucide-react'
import { buildGraph, type GraphFilters } from './graph'
import type { GraphKind, GraphNode, Workspace } from './types'

const kindLabel: Record<GraphKind, string> = { folder: 'Folder', note: 'My note', tag: 'Topic', source: 'Source' }
const zoneLabel: Record<GraphKind, string> = { folder: 'Folders', note: 'My notes', tag: 'Topics', source: 'Sources' }
const descriptions: Record<GraphKind, string> = {
  folder: 'Where your notes are organised', note: 'Your saved ideas and reflections',
  tag: 'Hashtags shared across notes', source: 'Documents, websites, videos and imported text',
}
const glyph: Record<GraphKind, string> = { folder: '▰', note: '✎', tag: '#', source: '▤' }
const zoneOrder: GraphKind[] = ['folder', 'tag', 'source', 'note']
type PositionedNode = GraphNode & { width: number; height: number }
type Layout = { nodes: PositionedNode[]; zones: Array<{ kind: GraphKind; x: number; y: number; width: number; height: number; total: number }>; width: number; height: number }

function wrap(value: string, maximum = 23) {
  const words = value.trim().split(/\s+/).flatMap((word) => word.length > maximum ? word.match(new RegExp(`.{1,${maximum}}`, 'g')) || [word] : [word])
  const lines: string[] = []
  words.forEach((word) => {
    const index = Math.max(0, lines.length - 1)
    if (!lines.length || `${lines[index]} ${word}`.length > maximum) lines.push(word)
    else lines[index] += ` ${word}`
  })
  if (lines.length > 2) return [lines[0], `${lines[1].slice(0, Math.max(1, maximum - 1))}…`]
  return lines.length ? lines : ['Untitled']
}

function layoutGraph(nodes: GraphNode[], totals: Record<GraphKind, number>, viewportWidth: number, viewportHeight: number, focusId: string): Layout {
  if (focusId) {
    const width = Math.max(760, viewportWidth * 1.25), height = Math.max(620, viewportHeight * 1.25)
    const center = { x: width / 2, y: height / 2 }
    const focusIndex = nodes.findIndex((node) => node.id === focusId)
    const others = nodes.filter((node) => node.id !== focusId)
    const positioned = nodes.map((node) => {
      const lines = wrap(node.label)
      const size = { width: Math.max(190, Math.min(270, 105 + Math.max(...lines.map((line) => line.length)) * 7.2)), height: lines.length > 1 ? 86 : 76 }
      if (node.id === focusId) return { ...node, ...center, ...size }
      const index = others.findIndex((item) => item.id === node.id)
      const angle = index / Math.max(1, others.length) * Math.PI * 2 - Math.PI / 2
      const radius = Math.min(width, height) * (others.length > 10 ? .36 : .31)
      return { ...node, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, ...size }
    })
    return { nodes: positioned, zones: [], width, height }
  }

  const aspect = Math.max(.48, Math.min(3, viewportWidth / Math.max(1, viewportHeight)))
  const portrait = aspect < .86
  const compactKinds = zoneOrder.filter((kind) => kind !== 'note' && (nodes.some((node) => node.kind === kind) || totals[kind]))
  const rows: GraphKind[][] = []
  const perRow = portrait ? 1 : aspect < 1.4 ? 2 : 3
  for (let i = 0; i < compactKinds.length; i += perRow) rows.push(compactKinds.slice(i, i + perRow))
  if (nodes.some((node) => node.kind === 'note') || totals.note) rows.push(['note'])
  const minimumWidth = portrait ? 760 : Math.max(1000, viewportWidth * 1.35)
  const gap = 34, outer = 24, header = 78
  let width = minimumWidth

  const measure = (candidateWidth: number) => {
    let height = outer
    const heights: number[] = []
    rows.forEach((row) => {
      const zoneWidth = (candidateWidth - outer * 2 - gap * (row.length - 1)) / row.length
      let rowHeight = header + 28
      row.forEach((kind) => {
        const items = nodes.filter((node) => node.kind === kind)
        const columns = Math.max(1, Math.floor((zoneWidth - 52) / (kind === 'note' ? 230 : 210)))
        rowHeight = Math.max(rowHeight, header + 26 + Math.ceil(items.length / columns) * 104)
      })
      heights.push(rowHeight); height += rowHeight + gap
    })
    return { height: Math.max(620, height - gap + outer), heights }
  }
  let measured = measure(width)
  while (width / measured.height < aspect && width < 12000) {
    width += Math.max(50, Math.round(width * .03)); measured = measure(width)
  }
  const targetHeight = width / aspect
  const slack = Math.max(0, targetHeight - measured.height)
  const rowHeights = measured.heights.map((height) => height + slack / Math.max(1, rows.length))
  const positioned: PositionedNode[] = []
  const zones: Layout['zones'] = []
  let y = outer
  rows.forEach((row, rowIndex) => {
    const zoneWidth = (width - outer * 2 - gap * (row.length - 1)) / row.length
    let x = outer
    row.forEach((kind) => {
      const items = nodes.filter((node) => node.kind === kind).sort((a, b) => a.label.localeCompare(b.label))
      const columns = Math.max(1, Math.floor((zoneWidth - 52) / (kind === 'note' ? 230 : 210)))
      const cellWidth = (zoneWidth - 52) / columns
      items.forEach((node, index) => {
        const lines = wrap(node.label)
        const nodeWidth = Math.min(cellWidth - 16, Math.max(178, 102 + Math.max(...lines.map((line) => line.length)) * 7.2))
        positioned.push({ ...node, x: x + 26 + cellWidth * (index % columns) + cellWidth / 2, y: y + header + 30 + Math.floor(index / columns) * 104 + 38, width: nodeWidth, height: lines.length > 1 ? 82 : 72 })
      })
      zones.push({ kind, x, y, width: zoneWidth, height: rowHeights[rowIndex], total: totals[kind] })
      x += zoneWidth + gap
    })
    y += rowHeights[rowIndex] + gap
  })
  return { nodes: positioned, zones, width, height: y - gap + outer }
}

export default function GraphCanvas({ workspace, onOpenNote, onOpenSource, onClose }: {
  workspace: Workspace; onOpenNote: (id: string) => void; onOpenSource: (id: string) => void; onClose: () => void
}) {
  const stage = useRef<HTMLDivElement>(null), world = useRef<SVGGElement>(null)
  const previousPositions = useRef(new Map<string, { x: number; y: number }>())
  const camera = useRef({ x: 0, y: 0, scale: 1 }), pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ type: 'pan' | 'pinch'; x: number; y: number; tx: number; ty: number; distance?: number; scale?: number } | null>(null)
  const moved = useRef(false), pressed = useRef('')
  const [size, setSize] = useState({ width: 1200, height: 760 }), [selectedId, setSelectedId] = useState(''), [focusId, setFocusId] = useState('')
  const [query, setQuery] = useState(''), [filtersOpen, setFiltersOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false)
  const [filters, setFilters] = useState<GraphFilters>({ notes: true, folders: true, tags: true, sources: true })
  const result = useMemo(() => buildGraph(workspace, filters, focusId, size.width <= 1180), [workspace, filters, focusId, size.width])
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return result
    const matches = new Set(result.nodes.filter((node) => `${node.label} ${node.summary || ''}`.toLocaleLowerCase().includes(q)).map((node) => node.id))
    const visible = new Set(matches)
    result.edges.forEach((edge) => { if (matches.has(edge.from)) visible.add(edge.to); if (matches.has(edge.to)) visible.add(edge.from) })
    return { ...result, nodes: result.nodes.filter((node) => visible.has(node.id)), edges: result.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)) }
  }, [result, query])
  const layout = useMemo(() => layoutGraph(filtered.nodes, filtered.totals, size.width, size.height, focusId), [filtered.nodes, filtered.totals, size, focusId])
  const byId = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes])
  const connected = useMemo(() => {
    const values = new Set(selectedId ? [selectedId] : [])
    filtered.edges.forEach((edge) => { if (edge.from === selectedId) values.add(edge.to); if (edge.to === selectedId) values.add(edge.from) })
    return values
  }, [selectedId, filtered.edges])
  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) setSelectedId('')
    if (focusId && !byId.has(focusId)) setFocusId('')
  }, [byId, selectedId, focusId])

  function applyCamera() { world.current?.setAttribute('transform', `translate(${camera.current.x} ${camera.current.y}) scale(${camera.current.scale})`) }
  function fit() {
    const element = stage.current
    if (!element) return
    const scale = Math.min(element.clientWidth / layout.width, element.clientHeight / layout.height) * .965
    camera.current = { scale, x: (element.clientWidth - layout.width * scale) / 2, y: (element.clientHeight - layout.height * scale) / 2 }
    applyCamera()
  }
  useEffect(() => { const frame = requestAnimationFrame(fit); return () => cancelAnimationFrame(frame) }, [layout.width, layout.height, focusId])
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced && layout.nodes.length <= 260) {
      world.current?.querySelectorAll<SVGGElement>('.mindmap-node').forEach((element) => {
        const node = byId.get(element.dataset.nodeId || ''), old = previousPositions.current.get(element.dataset.nodeId || '')
        if (!node || !old || Math.hypot(node.x - old.x, node.y - old.y) < 2) return
        element.animate([
          { transform: `translate(${old.x}px, ${old.y}px)`, opacity: .45 },
          { transform: `translate(${node.x}px, ${node.y}px)`, opacity: 1 },
        ], { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' })
      })
    }
    previousPositions.current = new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
  }, [layout.nodes, byId])
  useEffect(() => {
    const updateSize = () => { if (stage.current) setSize({ width: stage.current.clientWidth, height: stage.current.clientHeight }) }
    const observer = new ResizeObserver(updateSize)
    if (stage.current) observer.observe(stage.current)
    window.visualViewport?.addEventListener('resize', updateSize)
    updateSize()
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener('resize', updateSize) }
  }, [])

  function zoom(factor: number, clientX?: number, clientY?: number) {
    const box = stage.current?.getBoundingClientRect(); if (!box) return
    const old = camera.current.scale, next = Math.max(.025, Math.min(40, old * factor))
    const x = (clientX ?? box.left + box.width / 2) - box.left, y = (clientY ?? box.top + box.height / 2) - box.top
    camera.current = { scale: next, x: x - (x - camera.current.x) * next / old, y: y - (y - camera.current.y) * next / old }; applyCamera()
  }
  function pointDistance() { const [a, b] = [...pointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1 }
  function pointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    moved.current = false; pressed.current = (event.target as Element).closest<SVGGElement>('.mindmap-node')?.dataset.nodeId || ''
    if (pointers.current.size === 2) gesture.current = { type: 'pinch', x: 0, y: 0, tx: camera.current.x, ty: camera.current.y, distance: pointDistance(), scale: camera.current.scale }
    else gesture.current = { type: 'pan', x: event.clientX, y: event.clientY, tx: camera.current.x, ty: camera.current.y }
  }
  function pointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      if (gesture.current.type !== 'pinch') gesture.current = { type: 'pinch', x: 0, y: 0, tx: camera.current.x, ty: camera.current.y, distance: pointDistance(), scale: camera.current.scale }
      camera.current.scale = Math.max(.025, Math.min(40, (gesture.current.scale || 1) * pointDistance() / Math.max(1, gesture.current.distance || 1)))
      moved.current = true
    } else if (gesture.current.type === 'pan') {
      const dx = event.clientX - gesture.current.x, dy = event.clientY - gesture.current.y
      if (Math.hypot(dx, dy) > 5) moved.current = true
      camera.current.x = gesture.current.tx + dx; camera.current.y = gesture.current.ty + dy
    }
    applyCamera()
  }
  function pointerUp(event: React.PointerEvent) {
    const activate = pointers.current.size === 1 && !moved.current && pressed.current
    pointers.current.delete(event.pointerId); gesture.current = null
    if (activate) activateNode(pressed.current)
    pressed.current = ''
  }
  function activateNode(id: string) {
    if (selectedId === id) {
      const node = byId.get(id)
      if (node?.kind === 'note') onOpenNote(node.rawId)
      else if (node?.kind === 'source') onOpenSource(node.rawId)
      else setFocusId(id)
    } else setSelectedId(id)
  }
  const selected = byId.get(selectedId)
  const count = (kind: GraphKind) => filtered.totals[kind]

  return <section className={`notes-mindmap ${selectedId ? 'has-map-selection' : ''} ${result.optimized ? 'is-large-map' : ''}`}>
    <header className="mindmap-header">
      <div><span className="mindmap-kicker">MindNotes knowledge map</span><h3>{focusId ? `${byId.get(focusId)?.label || 'Focused'} connections` : 'Notes and connections'}</h3><p>{count('note')} notes · {count('tag')} topics · {count('source')} sources{result.optimized ? ` · Optimised view of ${filtered.nodes.length} items` : ''}</p></div>
      <label className="mindmap-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a note, topic, folder, or source" aria-label="Search mind map"/>{query && <button onClick={() => setQuery('')} aria-label="Clear map search"><X/></button>}</label>
      <div className="mindmap-actions">
        <button onClick={() => selectedId && setFocusId(selectedId)} disabled={!selectedId} aria-label="Focus selected node"><Focus/></button>
        <button onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-label="Filter mind map"><Filter/></button>
        <button onClick={fit} aria-label="Fit mind map"><Maximize2/></button>
        <button onClick={() => setHelpOpen((open) => !open)} aria-label="Mind map help"><HelpCircle/></button>
        <button className="mindmap-close" onClick={onClose} aria-label="Close mind map"><X/></button>
      </div>
    </header>
    {filtersOpen && <aside className="mindmap-filter-panel"><header><div><span>Map controls</span><strong>Choose exactly what appears</strong></div><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X/></button></header><section><span className="mindmap-filter-label">Show or hide sections</span><div className="mindmap-section-controls">{(['folders', 'notes', 'tags', 'sources'] as const).map((key) => <label key={key}><input type="checkbox" checked={filters[key]} onChange={() => setFilters((old) => ({ ...old, [key]: !old[key] }))}/><span>{key === 'tags' ? 'Topics' : key[0].toUpperCase() + key.slice(1)}</span><small>{count(key === 'folders' ? 'folder' : key === 'notes' ? 'note' : key === 'tags' ? 'tag' : 'source')}</small></label>)}</div></section><footer><button onClick={() => setFilters({ notes: true, folders: true, tags: true, sources: true })}>Show everything</button></footer></aside>}
    {helpOpen && <aside className="mindmap-help-card"><button onClick={() => setHelpOpen(false)} aria-label="Close help"><X/></button><strong>Using the map</strong><span>Tap a box to highlight its links. Tap it again to open or focus it. Drag to move, pinch or scroll to zoom, and double tap empty space to fit the map.</span></aside>}
    <div className="mindmap-legend"><span data-legend="note"><i/>My note</span><span data-legend="note-link"><i/>Linked note</span><span data-legend="tag"><i/>Topic</span><span data-legend="folder"><i/>Folder</span><span data-legend="source"><i/>Source</span></div>
    <div className="mindmap-stage" ref={stage} onDoubleClick={fit} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(event) => { event.preventDefault(); zoom(Math.exp(-event.deltaY * .0015), event.clientX, event.clientY) }}>
      <svg role="img" aria-label="Interactive clustered graph of notes, topics, folders, and sources"><g className="mindmap-world" ref={world}>
        <g className="mindmap-zones">{layout.zones.map((zone) => <g className={`mindmap-zone zone-${zone.kind}`} key={zone.kind}><rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="22"/><text className="mindmap-zone-icon" x={zone.x + 22} y={zone.y + 31}>{glyph[zone.kind]}</text><text className="mindmap-zone-title" x={zone.x + 48} y={zone.y + 29}>{zoneLabel[zone.kind]} · {zone.total}</text><text className="mindmap-zone-description" x={zone.x + 22} y={zone.y + 54}>{descriptions[zone.kind]}</text></g>)}</g>
        <g className="mindmap-edges">{filtered.edges.map((edge) => { const a = byId.get(edge.from), b = byId.get(edge.to); if (!a || !b) return null; const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x); const path = vertical ? `M ${a.x} ${a.y + a.height / 2} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - b.height / 2}` : `M ${a.x + Math.sign(b.x-a.x)*a.width/2} ${a.y} C ${(a.x+b.x)/2} ${a.y}, ${(a.x+b.x)/2} ${b.y}, ${b.x-Math.sign(b.x-a.x)*b.width/2} ${b.y}`; return <path key={edge.id} className={`mindmap-edge edge-${edge.kind} ${connected.has(edge.from) && connected.has(edge.to) ? 'is-connected' : ''}`} d={path}/> })}</g>
        <g className="mindmap-nodes">{layout.nodes.map((node, index) => { const lines = wrap(node.label); return <g key={node.id} data-node-id={node.id} role="button" tabIndex={0} aria-label={`${kindLabel[node.kind]}: ${node.label}`} className={`mindmap-node node-${node.kind} ${selectedId && connected.has(node.id) ? 'is-connected' : ''} ${node.id === focusId ? 'is-focus-note' : ''}`} style={{ '--node-order': Math.min(index, 40) } as React.CSSProperties} transform={`translate(${node.x} ${node.y})`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateNode(node.id) } }}><rect x={-node.width/2} y={-node.height/2} width={node.width} height={node.height} rx="14"/><text className="node-icon" x={-node.width/2+18} y={lines.length > 1 ? -10 : -5}>{glyph[node.kind]}</text><text className="node-label" x={-node.width/2+48} y={lines.length > 1 ? -14 : -8}>{lines.map((line, lineIndex) => <tspan key={lineIndex} x={-node.width/2+48} dy={lineIndex ? 17 : 0}>{line}</tspan>)}</text><text className="node-type-label" x={-node.width/2+48} y={node.height/2-13}>{kindLabel[node.kind].toLocaleUpperCase()}{node.count ? ` · ${node.count}` : ''}</text></g> })}</g>
      </g></svg>{!layout.nodes.length && <div className="mindmap-no-results"><Search/><strong>No connections found</strong><span>Try another search or show more sections.</span></div>}
    </div>
    {selected && <aside className="mindmap-inspector"><button className="mindmap-inspector-close" onClick={() => setSelectedId('')} aria-label="Clear focus"><X/></button><span>{kindLabel[selected.kind]}</span><strong>{selected.label}</strong>{selected.summary && <p>{selected.summary.slice(0, 180)}</p>}<small>{Math.max(0, connected.size - 1)} direct connections</small>{selected.kind === 'note' && <button className="text-button primary" onClick={() => onOpenNote(selected.rawId)}>Open note</button>}{selected.kind === 'source' && <button className="text-button primary" onClick={() => onOpenSource(selected.rawId)}>Open source</button>}<button className="text-button" onClick={() => setFocusId(selected.id)}>Show only connections</button></aside>}
  </section>
}
