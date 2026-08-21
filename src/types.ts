export type NoteStatus = 'seed' | 'growing' | 'evergreen'
export type SourceKind = 'pdf' | 'word' | 'powerpoint' | 'spreadsheet' | 'url' | 'youtube' | 'text' | 'file'

export interface Folder { id: string; name: string; parentId: string | null; color: string; createdAt: string }
export interface Source { id: string; title: string; kind: SourceKind; text: string; url?: string; fileName?: string; createdAt: string; updatedAt: string }
export interface SourceExcerpt { id: string; sourceId: string; text: string; start?: number; end?: number; createdAt: string }
export interface Note {
  id: string; title: string; body: string; folderId: string | null; tags: string[]; linkedNoteIds: string[];
  sourceIds: string[]; excerpts?: SourceExcerpt[]; status: NoteStatus; favorite: boolean; color: string; createdAt: string; updatedAt: string;
}
export interface Workspace { version: 1; notes: Note[]; folders: Folder[]; sources: Source[]; updatedAt: string }
export type View = 'notes' | 'map' | 'sources' | 'search' | 'settings'
export type GraphKind = 'note' | 'folder' | 'tag' | 'source'
export interface GraphNode { id: string; rawId: string; kind: GraphKind; label: string; x: number; y: number; color: string; count?: number; summary?: string; external?: boolean }
export interface GraphEdge { id: string; from: string; to: string; kind: 'folder' | 'tag' | 'source' | 'link' }
