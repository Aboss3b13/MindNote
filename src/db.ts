import type { Workspace } from './types'

const DB = 'mindnotes-workspace'
const STORE = 'workspace'
const KEY = 'primary'

const emptyWorkspace = (): Workspace => ({ version: 1, notes: [], folders: [], sources: [], updatedAt: new Date().toISOString() })

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY)
    request.onsuccess = () => resolve(request.result || emptyWorkspace())
    request.onerror = () => reject(request.error)
  })
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(workspace, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function freshWorkspace(): Workspace {
  const now = new Date().toISOString()
  const ideas = crypto.randomUUID()
  const sources = crypto.randomUUID()
  const first = crypto.randomUUID()
  return {
    version: 1,
    updatedAt: now,
    folders: [
      { id: ideas, name: 'Ideas', parentId: null, color: '#c68b3c', createdAt: now },
      { id: sources, name: 'Research', parentId: null, color: '#3d7b70', createdAt: now },
    ],
    sources: [],
    notes: [{
      id: first, title: 'Welcome to MindNotes', folderId: ideas, tags: ['welcome', 'mindnotes'], linkedNoteIds: [], sourceIds: [],
      body: 'Connect your thoughts with folders, hashtags, sources, and direct note links. Open the mind map to see these relationships come alive.',
      status: 'seed', favorite: true, color: '#d4a84f', createdAt: now, updatedAt: now,
    }],
  }
}
