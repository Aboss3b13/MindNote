import type { GraphEdge, GraphNode, Workspace } from './types'

export interface GraphFilters { notes: boolean; folders: boolean; tags: boolean; sources: boolean }
export function buildGraph(workspace: Workspace, filters: GraphFilters, focusId = ''): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const addNode = (node: Omit<GraphNode, 'x' | 'y'>) => { if (!nodes.has(node.id)) nodes.set(node.id, { ...node, x: 0, y: 0 }) }
  const addEdge = (from: string, to: string, kind: GraphEdge['kind']) => {
    const id = `${from}|${to}|${kind}`
    if (!edges.has(id)) edges.set(id, { id, from, to, kind })
  }
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]))
  const tagCounts = new Map<string, number>()
  workspace.notes.forEach((note) => note.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)))
  if (filters.folders) workspace.folders.forEach((folder) => addNode({ id: `folder:${folder.id}`, rawId: folder.id, kind: 'folder', label: folder.name, color: folder.color }))
  workspace.notes.forEach((note) => {
    if (filters.notes) addNode({ id: `note:${note.id}`, rawId: note.id, kind: 'note', label: note.title || 'Untitled', color: note.color })
    if (filters.folders && note.folderId) addEdge(`note:${note.id}`, `folder:${note.folderId}`, 'folder')
    if (filters.tags) note.tags.forEach((tag) => {
      addNode({ id: `tag:${tag.toLowerCase()}`, rawId: tag, kind: 'tag', label: `#${tag}`, color: '#8671ad', count: tagCounts.get(tag) || 1 })
      addEdge(`note:${note.id}`, `tag:${tag.toLowerCase()}`, 'tag')
    })
    if (filters.sources) note.sourceIds.forEach((sourceId) => {
      const source = sourceById.get(sourceId)
      if (source) addNode({ id: `source:${source.id}`, rawId: source.id, kind: 'source', label: source.title, color: '#3d7b70' })
      addEdge(`note:${note.id}`, `source:${sourceId}`, 'source')
    })
    if (filters.notes) note.linkedNoteIds.forEach((linkedId) => addEdge(`note:${note.id}`, `note:${linkedId}`, 'link'))
  })

  let selectedNodes = [...nodes.values()]
  let selectedEdges = [...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
  if (focusId && nodes.has(focusId)) {
    const neighbourIds = new Set([focusId])
    selectedEdges.forEach((edge) => { if (edge.from === focusId) neighbourIds.add(edge.to); if (edge.to === focusId) neighbourIds.add(edge.from) })
    selectedNodes = selectedNodes.filter((node) => neighbourIds.has(node.id))
    selectedEdges = selectedEdges.filter((edge) => neighbourIds.has(edge.from) && neighbourIds.has(edge.to))
  } else if (selectedNodes.length > 320) {
    const degree = new Map<string, number>()
    selectedEdges.forEach((edge) => { degree.set(edge.from, (degree.get(edge.from) || 0) + 1); degree.set(edge.to, (degree.get(edge.to) || 0) + 1) })
    const allowed = new Set(selectedNodes.sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, 320).map((node) => node.id))
    selectedNodes = selectedNodes.filter((node) => allowed.has(node.id))
    selectedEdges = selectedEdges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to)).slice(0, 900)
  }
  return layoutGraph(selectedNodes, selectedEdges, focusId)
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], focusId: string) {
  const byKind = ['folder', 'source', 'tag', 'note'] as const
  const width = 1400, height = 900, center = { x: width / 2, y: height / 2 }
  if (focusId) {
    nodes.forEach((node, index) => {
      if (node.id === focusId) { node.x = center.x; node.y = center.y; return }
      const angle = ((index - Number(nodes[0]?.id === focusId)) / Math.max(1, nodes.length - 1)) * Math.PI * 2 - Math.PI / 2
      const radius = Math.min(330, 150 + nodes.length * 9)
      node.x = center.x + Math.cos(angle) * radius; node.y = center.y + Math.sin(angle) * radius
    })
  } else {
    byKind.forEach((kind, kindIndex) => {
      const group = nodes.filter((node) => node.kind === kind)
      group.forEach((node, index) => {
        const cols = Math.max(1, Math.ceil(Math.sqrt(group.length * 1.5)))
        const col = index % cols, row = Math.floor(index / cols)
        const zoneX = 180 + (kindIndex % 2) * 680, zoneY = 150 + Math.floor(kindIndex / 2) * 420
        node.x = zoneX + col * 170; node.y = zoneY + row * 100
      })
    })
  }
  return { nodes, edges }
}
