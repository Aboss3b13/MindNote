import type { GraphEdge, GraphKind, GraphNode, Workspace } from './types'

export interface GraphFilters { notes: boolean; folders: boolean; tags: boolean; sources: boolean }
export interface GraphResult { nodes: GraphNode[]; edges: GraphEdge[]; totals: Record<GraphKind, number>; optimized: boolean }

const limits: Record<GraphKind, number> = { folder: 60, note: 260, tag: 100, source: 100 }
const tabletLimits: Record<GraphKind, number> = { folder: 40, note: 135, tag: 60, source: 60 }

export function buildGraph(workspace: Workspace, filters: GraphFilters, focusId = '', compact = false): GraphResult {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const addNode = (node: Omit<GraphNode, 'x' | 'y'>) => {
    if (!nodes.has(node.id)) nodes.set(node.id, { ...node, x: 0, y: 0 })
  }
  const addEdge = (from: string, to: string, kind: GraphEdge['kind']) => {
    if (from === to) return
    const pair = kind === 'link' && from > to ? [to, from] : [from, to]
    const id = `${pair[0]}|${pair[1]}|${kind}`
    if (!edges.has(id)) edges.set(id, { id, from: pair[0], to: pair[1], kind })
  }

  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]))
  const folderById = new Map(workspace.folders.map((folder) => [folder.id, folder]))
  const noteIds = new Set(workspace.notes.map((note) => note.id))
  const tagCounts = new Map<string, number>()
  workspace.notes.forEach((note) => note.tags.forEach((tag) => {
    const normalized = tag.trim().toLocaleLowerCase()
    if (normalized) tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1)
  }))

  workspace.folders.forEach((folder) => {
    addNode({ id: `folder:${folder.id}`, rawId: folder.id, kind: 'folder', label: folder.name, color: folder.color })
    if (folder.parentId && folderById.has(folder.parentId)) addEdge(`folder:${folder.parentId}`, `folder:${folder.id}`, 'folder')
  })
  workspace.sources.forEach((source) => addNode({
    id: `source:${source.id}`, rawId: source.id, kind: 'source', label: source.title,
    color: '#168b7a', summary: source.text.slice(0, 220),
  }))
  workspace.notes.forEach((note) => {
    const noteId = `note:${note.id}`
    addNode({ id: noteId, rawId: note.id, kind: 'note', label: note.title.trim() || 'Untitled note', color: note.color, summary: note.body })
    if (note.folderId && folderById.has(note.folderId)) addEdge(`folder:${note.folderId}`, noteId, 'folder')
    note.tags.forEach((tag) => {
      const normalized = tag.trim().toLocaleLowerCase()
      if (!normalized) return
      addNode({ id: `tag:${normalized}`, rawId: normalized, kind: 'tag', label: `#${normalized}`, color: '#8355cf', count: tagCounts.get(normalized) || 1 })
      addEdge(noteId, `tag:${normalized}`, 'tag')
    })
    note.sourceIds.forEach((sourceId) => {
      if (sourceById.has(sourceId)) addEdge(noteId, `source:${sourceId}`, 'source')
    })
    note.linkedNoteIds.forEach((linkedId) => {
      if (noteIds.has(linkedId)) addEdge(noteId, `note:${linkedId}`, 'link')
    })
  })

  const allowedKinds = new Set<GraphKind>()
  if (filters.notes) allowedKinds.add('note')
  if (filters.folders) allowedKinds.add('folder')
  if (filters.tags) allowedKinds.add('tag')
  if (filters.sources) allowedKinds.add('source')
  let selectedNodes = [...nodes.values()].filter((node) => allowedKinds.has(node.kind))
  let selectedIds = new Set(selectedNodes.map((node) => node.id))
  let selectedEdges = [...edges.values()].filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
  const totals = selectedNodes.reduce((value, node) => {
    value[node.kind] += 1
    return value
  }, { folder: 0, note: 0, tag: 0, source: 0 } as Record<GraphKind, number>)

  if (focusId && selectedIds.has(focusId)) {
    const neighbourhood = new Set([focusId])
    selectedEdges.forEach((edge) => {
      if (edge.from === focusId) neighbourhood.add(edge.to)
      if (edge.to === focusId) neighbourhood.add(edge.from)
    })
    selectedNodes = selectedNodes.filter((node) => neighbourhood.has(node.id))
    selectedEdges = selectedEdges.filter((edge) => neighbourhood.has(edge.from) && neighbourhood.has(edge.to))
    return { nodes: selectedNodes, edges: selectedEdges, totals, optimized: false }
  }

  const degree = new Map<string, number>()
  selectedEdges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1)
  })
  const activeLimits = compact ? tabletLimits : limits
  const bounded: GraphNode[] = []
  ;(['folder', 'note', 'tag', 'source'] as GraphKind[]).forEach((kind) => {
    const group = selectedNodes.filter((node) => node.kind === kind).sort((a, b) =>
      (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.label.localeCompare(b.label))
    bounded.push(...group.slice(0, activeLimits[kind]))
  })
  const optimized = bounded.length < selectedNodes.length
  selectedNodes = bounded
  selectedIds = new Set(selectedNodes.map((node) => node.id))
  selectedEdges = selectedEdges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to)).slice(0, compact ? 560 : 2400)
  return { nodes: selectedNodes, edges: selectedEdges, totals, optimized }
}
