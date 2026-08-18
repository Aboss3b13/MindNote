import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, SlidersHorizontal, X } from 'lucide-react'
import { buildGraph, type GraphFilters } from './graph'
import type { GraphNode, Workspace } from './types'

interface Props { workspace: Workspace; onOpenNote: (id: string) => void }
const icons = { note: '✦', folder: '▰', tag: '#', source: '⌁' }

export default function GraphCanvas({ workspace, onOpenNote }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | null>(null)
  const [focusId, setFocusId] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<GraphFilters>({ notes: true, folders: true, tags: true, sources: true })
  const graph = useMemo(() => buildGraph(workspace, filters, focusId), [workspace, filters, focusId])

  const fit = useCallback(() => {
    const box = boxRef.current
    if (!box || !graph.nodes.length) return
    const xs = graph.nodes.map((node) => node.x), ys = graph.nodes.map((node) => node.y)
    const minX = Math.min(...xs) - 130, maxX = Math.max(...xs) + 130, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 70
    const scale = Math.min(1.25, Math.max(.14, Math.min(box.clientWidth / (maxX - minX), box.clientHeight / (maxY - minY)) * .88))
    transform.current = { scale, x: (box.clientWidth - (minX + maxX) * scale) / 2, y: (box.clientHeight - (minY + maxY) * scale) / 2 }
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  const draw = useCallback(() => {
    const canvas = canvasRef.current, box = boxRef.current
    if (!canvas || !box) return
    const dpr = Math.min(devicePixelRatio || 1, 2), rect = box.getBoundingClientRect()
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) { canvas.width = rect.width * dpr; canvas.height = rect.height * dpr }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height)
    const { x, y, scale } = transform.current
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale)
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    ctx.lineWidth = 2 / Math.max(.5, scale); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--edge').trim() || '#798f88'
    graph.edges.forEach((edge) => {
      const from = byId.get(edge.from), to = byId.get(edge.to); if (!from || !to) return
      ctx.beginPath(); ctx.moveTo(from.x, from.y); const mx = (from.x + to.x) / 2; ctx.bezierCurveTo(mx, from.y, mx, to.y, to.x, to.y); ctx.stroke()
    })
    graph.nodes.forEach((node) => drawNode(ctx, node, node.id === focusId))
    ctx.restore()
  }, [graph, focusId])

  useEffect(() => { const frame = requestAnimationFrame(fit); return () => cancelAnimationFrame(frame) }, [fit])
  useEffect(() => { const observer = new ResizeObserver(() => fit()); if (boxRef.current) observer.observe(boxRef.current); return () => observer.disconnect() }, [fit])
  useEffect(() => { draw() }, [draw])

  function hit(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect(), t = transform.current
    const x = (clientX - rect.left - t.x) / t.scale, y = (clientY - rect.top - t.y) / t.scale
    return [...graph.nodes].reverse().find((node) => Math.abs(x - node.x) < 72 && Math.abs(y - node.y) < 31)
  }
  function pointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: transform.current.scale } }
  }
  function pointerMove(event: React.PointerEvent) {
    const old = pointers.current.get(event.pointerId); if (!old) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()], distance = Math.hypot(a.x - b.x, a.y - b.y)
      transform.current.scale = Math.min(3, Math.max(.12, pinch.current.scale * distance / pinch.current.distance)); drag.current!.moved = true; draw(); return
    }
    if (drag.current) { transform.current.x += event.clientX - old.x; transform.current.y += event.clientY - old.y; drag.current.moved ||= Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5; draw() }
  }
  function pointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId); pinch.current = null
    if (drag.current && !drag.current.moved) {
      const node = hit(event.clientX, event.clientY)
      if (node) { if (focusId === node.id && node.kind === 'note') onOpenNote(node.rawId); else setFocusId(node.id) }
    }
    drag.current = null
  }
  function wheel(event: React.WheelEvent) {
    event.preventDefault(); const old = transform.current.scale, next = Math.min(3, Math.max(.12, old * Math.exp(-event.deltaY * .001)))
    const rect = canvasRef.current!.getBoundingClientRect(), px = event.clientX - rect.left, py = event.clientY - rect.top
    transform.current.x = px - (px - transform.current.x) * next / old; transform.current.y = py - (py - transform.current.y) * next / old; transform.current.scale = next; draw()
  }

  return <section className="graph-shell">
    <div className="graph-toolbar">
      <div><span className="eyebrow">Living knowledge graph</span><h2>{focusId ? 'Focused branch' : 'Everything, connected'}</h2><p>{graph.nodes.length} nodes · {graph.edges.length} connections</p></div>
      <div className="graph-actions">
        {focusId && <button className="button quiet" onClick={() => setFocusId('')}><X size={17}/> Clear focus</button>}
        <button className="icon-button" aria-label="Map filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={19}/></button>
        <button className="icon-button" aria-label="Fit map" onClick={fit}><Maximize2 size={19}/></button>
      </div>
    </div>
    {filtersOpen && <div className="map-filters" aria-label="Map filters">{Object.keys(filters).map((key) => <label key={key}><input type="checkbox" checked={filters[key as keyof GraphFilters]} onChange={() => setFilters((old) => ({ ...old, [key]: !old[key as keyof GraphFilters] }))}/><span>{key}</span></label>)}</div>}
    <div className="graph-canvas" ref={boxRef}><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}/>
      {!graph.nodes.length && <div className="empty"><strong>Nothing to map yet</strong><span>Create a note or enable a node type.</span></div>}
      <div className="graph-tip">Tap to focus · tap again to open · drag to pan · pinch to zoom</div>
    </div>
  </section>
}

function drawNode(ctx: CanvasRenderingContext2D, node: GraphNode, focused: boolean) {
  const w = 144, h = 62, x = node.x - w / 2, y = node.y - h / 2
  ctx.save(); ctx.shadowColor = focused ? `${node.color}77` : 'rgba(18,40,35,.13)'; ctx.shadowBlur = focused ? 22 : 9; ctx.shadowOffsetY = 4
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fffdf7'; roundRect(ctx, x, y, w, h, 18); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.lineWidth = focused ? 4 : 2; ctx.strokeStyle = node.color; ctx.stroke()
  ctx.fillStyle = node.color; ctx.font = '700 14px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText(icons[node.kind], x + 14, node.y)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#17332d'; ctx.font = '650 13px system-ui'
  const label = node.label.length > 17 ? `${node.label.slice(0, 16)}…` : node.label; ctx.fillText(label, x + 38, node.y - 7)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#66746f'; ctx.font = '11px system-ui'; ctx.fillText(node.count ? `${node.count} notes` : node.kind, x + 38, node.y + 12); ctx.restore()
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius)
}
