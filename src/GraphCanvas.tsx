import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, Focus, HelpCircle, Maximize2, Search, X } from 'lucide-react'
import { buildGraph, type GraphFilters } from './graph'
import type { GraphNode, Workspace } from './types'

interface Props { workspace: Workspace; onOpenNote: (id: string) => void }
const icon = { note: '✦', folder: '▰', tag: '#', source: '⌁' }
const label = { note: 'Notes', folder: 'Folders', tag: 'Topics', source: 'Sources' }
const description = { note: 'Your connected thoughts', folder: 'Organised spaces', tag: 'Shared ideas', source: 'Imported knowledge' }
const zones = { folder: { x: 35, y: 35, w: 750, h: 425 }, note: { x: 815, y: 35, w: 750, h: 425 }, tag: { x: 35, y: 490, w: 750, h: 425 }, source: { x: 815, y: 490, w: 750, h: 425 } }

export default function GraphCanvas({ workspace, onOpenNote }: Props) {
  const stage = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null)
  const transform = useRef({ x: 0, y: 0, scale: 1 }), drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, {x:number;y:number}>()), pinch = useRef<{ distance:number; scale:number } | null>(null)
  const [focusId, setFocusId] = useState(''), [selectedId, setSelectedId] = useState(''), [query,setQuery]=useState(''), [filterOpen,setFilterOpen]=useState(false), [help,setHelp]=useState(false)
  const [filters,setFilters]=useState<GraphFilters>({notes:true,folders:true,tags:true,sources:true})
  const graph=useMemo(()=>buildGraph(workspace,filters,focusId),[workspace,filters,focusId])
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase(); if(!q)return graph
    const ids=new Set(graph.nodes.filter((node)=>node.label.toLowerCase().includes(q)).map((node)=>node.id))
    graph.edges.forEach((edge)=>{if(ids.has(edge.from))ids.add(edge.to);if(ids.has(edge.to))ids.add(edge.from)})
    return {nodes:graph.nodes.filter((node)=>ids.has(node.id)),edges:graph.edges.filter((edge)=>ids.has(edge.from)&&ids.has(edge.to))}
  },[graph,query])
  const laidOut=useMemo(()=>positionByZones(visible.nodes,focusId),[visible.nodes,focusId])
  const byId=useMemo(()=>new Map(laidOut.map((node)=>[node.id,node])),[laidOut])
  const connected=useMemo(()=>{const ids=new Set<string>();if(selectedId)ids.add(selectedId);visible.edges.forEach((edge)=>{if(edge.from===selectedId)ids.add(edge.to);if(edge.to===selectedId)ids.add(edge.from)});return ids},[selectedId,visible.edges])

  function apply(){const world=svg.current?.querySelector<SVGGElement>('.mindmap-world');if(world)world.setAttribute('transform',`translate(${transform.current.x} ${transform.current.y}) scale(${transform.current.scale})`)}
  function fit(){const box=stage.current;if(!box)return;const scale=Math.min(box.clientWidth/1600,box.clientHeight/950)*.96;transform.current={scale,x:(box.clientWidth-1600*scale)/2,y:(box.clientHeight-950*scale)/2};apply()}
  useEffect(()=>{const id=requestAnimationFrame(fit);return()=>cancelAnimationFrame(id)},[laidOut.length,focusId])
  useEffect(()=>{const observer=new ResizeObserver(fit);if(stage.current)observer.observe(stage.current);return()=>observer.disconnect()},[])
  function nodeClick(node:GraphNode){if(drag.current?.moved)return;if(selectedId===node.id&&node.kind==='note')onOpenNote(node.rawId);else setSelectedId(node.id)}
  function pointerDown(event:React.PointerEvent){event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});drag.current={x:event.clientX,y:event.clientY,moved:false};if(pointers.current.size===2){const[a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:transform.current.scale}}}
  function pointerMove(event:React.PointerEvent){const old=pointers.current.get(event.pointerId);if(!old)return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.current.size===2&&pinch.current){const[a,b]=[...pointers.current.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);transform.current.scale=Math.min(4,Math.max(.08,pinch.current.scale*distance/pinch.current.distance));if(drag.current)drag.current.moved=true;apply();return}if(drag.current){transform.current.x+=event.clientX-old.x;transform.current.y+=event.clientY-old.y;drag.current.moved||=Math.hypot(event.clientX-drag.current.x,event.clientY-drag.current.y)>5;apply()}}
  function pointerUp(event:React.PointerEvent){pointers.current.delete(event.pointerId);pinch.current=null;requestAnimationFrame(()=>{drag.current=null})}
  function wheel(event:React.WheelEvent){event.preventDefault();const box=stage.current!.getBoundingClientRect(),old=transform.current.scale,next=Math.min(4,Math.max(.08,old*Math.exp(-event.deltaY*.001))),px=event.clientX-box.left,py=event.clientY-box.top;transform.current.x=px-(px-transform.current.x)*next/old;transform.current.y=py-(py-transform.current.y)*next/old;transform.current.scale=next;apply()}
  const selected=byId.get(selectedId)
  return <section className={`notes-mindmap ${laidOut.length>180?'is-large-map':''} ${selectedId?'has-map-selection':''} ${query?'has-map-search':''}`}>
    <header className="mindmap-header"><div><span className="mindmap-kicker">MindNotes knowledge map</span><h2>{focusId?'Focused connections':'Everything, connected'}</h2><p>{laidOut.length} items · {visible.edges.length} relationships</p></div><label className="mindmap-search"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Find a note, topic, folder, or source"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X/></button>}</label><div className="mindmap-actions"><button onClick={()=>setFocusId(selectedId)} disabled={!selected?.rawId} title="Focus on selection"><Focus/></button><button onClick={()=>setFilterOpen(!filterOpen)} title="Filter map"><Filter/></button><button onClick={fit} title="Fit map"><Maximize2/></button><button onClick={()=>setHelp(!help)} title="Map help"><HelpCircle/></button></div></header>
    {filterOpen&&<aside className="mindmap-filter-panel"><div><strong>Show or hide sections</strong><span>The map animates in place when filters change.</span></div>{Object.keys(filters).map((key)=><label key={key}><input type="checkbox" checked={filters[key as keyof GraphFilters]} onChange={()=>setFilters((old)=>({...old,[key]:!old[key as keyof GraphFilters]}))}/><span>{key}</span><small>{workspace[key==='tags'?'notes':key as 'notes'|'folders'|'sources']?.length||''}</small></label>)}</aside>}
    {help&&<aside className="mindmap-help-card"><button onClick={()=>setHelp(false)}><X/></button><strong>Using the map</strong><span>Tap a box to highlight its links. Tap the same note again to open it. Drag to move, pinch or scroll to zoom, and use Focus for a direct-neighbour view.</span></aside>}
    <div className="mindmap-legend"><span data-legend="note"><i/>My note</span><span data-legend="note-link"><i/>Direct link</span><span data-legend="tag"><i/>Topic</span><span data-legend="folder"><i/>Folder</span><span data-legend="source"><i/>Source</span></div>
    <div className="mindmap-stage" ref={stage} onDoubleClick={fit} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
      <svg ref={svg} role="img" aria-label="Interactive clustered graph of notes, topics, folders, and sources"><g className="mindmap-world">
        {!focusId&&Object.entries(zones).map(([kind,zone])=><g className={`mindmap-zone zone-${kind}`} key={kind}><rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="24"/><text className="mindmap-zone-icon" x={zone.x+24} y={zone.y+35}>{icon[kind as keyof typeof icon]}</text><text className="mindmap-zone-title" x={zone.x+52} y={zone.y+31}>{label[kind as keyof typeof label]}</text><text className="mindmap-zone-description" x={zone.x+24} y={zone.y+57}>{description[kind as keyof typeof description]}</text></g>)}
        <g className="mindmap-edges">{visible.edges.map((edge)=>{const from=byId.get(edge.from),to=byId.get(edge.to);if(!from||!to)return null;const mx=(from.x+to.x)/2;return <path key={edge.id} className={`mindmap-edge edge-${edge.kind} ${selectedId&&(connected.has(edge.from)&&connected.has(edge.to))?'is-connected':''}`} d={`M${from.x},${from.y} C${mx},${from.y} ${mx},${to.y} ${to.x},${to.y}`}/>})}</g>
        <g className="mindmap-nodes">{laidOut.map((node,index)=><g key={node.id} role="button" tabIndex={0} aria-label={`${label[node.kind]}: ${node.label}`} className={`mindmap-node node-${node.kind} ${connected.has(node.id)?'is-connected':''} ${query&&node.label.toLowerCase().includes(query.toLowerCase())?'is-search-match':''}`} style={{'--node-order':Math.min(index,30)} as React.CSSProperties} transform={`translate(${node.x-82} ${node.y-30})`} onClick={()=>nodeClick(node)} onKeyDown={(event)=>{if(event.key==='Enter')nodeClick(node)}}><rect width="164" height="60" rx="14"/><text className="node-icon" x="16" y="25">{icon[node.kind]}</text><text className="node-label" x="43" y="25">{truncate(node.label,18)}</text><text className="node-type-label" x="43" y="44">{label[node.kind].toUpperCase()}{node.count?` · ${node.count}`:''}</text></g>)}</g>
      </g></svg>{!laidOut.length&&<div className="mindmap-no-results"><Search/><strong>No connections found</strong><span>Try another search or enable more sections.</span></div>}</div>
    {selected&&<aside className="mindmap-inspector"><span>{label[selected.kind]}</span><strong>{selected.label}</strong><p>{selected.kind==='note'?workspace.notes.find((note)=>note.id===selected.rawId)?.body.slice(0,170):description[selected.kind]}</p><small>{Math.max(0,connected.size-1)} direct connections</small>{selected.kind==='note'&&<button className="button primary" onClick={()=>onOpenNote(selected.rawId)}>Open note</button>}<button className="mindmap-inspector-close" onClick={()=>setSelectedId('')}><X/></button></aside>}
  </section>
}

function positionByZones(nodes:GraphNode[],focusId:string){if(focusId){const center={x:800,y:475};return nodes.map((node,index)=>{if(node.id===focusId)return{...node,...center};const others=nodes.length-1,order=index-(nodes.findIndex((item)=>item.id===focusId)<index?1:0),angle=order/Math.max(1,others)*Math.PI*2-Math.PI/2,radius=Math.min(350,190+others*7);return{...node,x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius}})}return nodes.map((node)=>({...node})).map((node)=>{const zone=zones[node.kind],group=nodes.filter((item)=>item.kind===node.kind),index=group.findIndex((item)=>item.id===node.id),cols=Math.max(1,Math.floor((zone.w-45)/180)),col=index%cols,row=Math.floor(index/cols);return{...node,x:zone.x+105+col*180,y:zone.y+105+row*82}})}
function truncate(value:string,length:number){return value.length>length?`${value.slice(0,length-1)}…`:value}
