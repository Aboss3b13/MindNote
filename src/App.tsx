import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, BookOpen, Check, ChevronDown, CircleHelp, Cloud, Copy, Download, FilePlus2, Filter, Folder, FolderPlus, Folders, Hash, Link2, List, Menu, Moon, Network, NotebookPen, Plus, Quote, Search, Settings, Share2, Sparkles, SquareDashed, Star, Sun, Trash2, Upload, X } from 'lucide-react'
import GraphCanvas from './GraphCanvas'
import { extractFile, extractFileOnServer, extractRemote } from './importers'
import { freshWorkspace, loadWorkspace, saveWorkspace } from './db'
import { accountEmail, connect, logout, pullWorkspace, pushWorkspace, restoreAccount, signedIn, type AccountState } from './cloud'
import type { Folder as FolderType, Note, Source, SourceKind, View, Workspace } from './types'

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const colors = ['#d4a84f', '#3d7b70', '#b66b55', '#8671ad', '#6887a5']
const sourceIcons: Record<SourceKind, string> = { pdf: 'PDF', word: 'DOC', powerpoint: 'PPT', spreadsheet: 'XLS', url: 'URL', youtube: 'YT', text: 'TXT', file: 'FILE' }

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [view, setView] = useState<View>('notes')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [editorId, setEditorId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [theme, setTheme] = useState(localStorage.getItem('mindnotes-theme') || 'light')
  const [saved, setSaved] = useState(true)
  const [account, setAccount] = useState<AccountState>({ email: accountEmail(), signedIn: signedIn() })

  useEffect(() => { (async () => {
    const stored = await loadWorkspace(), hasLocal = Boolean(stored.notes.length || stored.sources.length), local = hasLocal ? stored : freshWorkspace()
    const session = await restoreAccount(); setAccount(session)
    if (session.signedIn) {
      try {
        const remote = await pullWorkspace()
        if (remote && (!hasLocal || Date.parse(remote.updatedAt || '') >= Date.parse(local.updatedAt || ''))) setWorkspace(remote)
        else { setWorkspace(local); if (hasLocal) pushWorkspace(local).catch(() => {}) }
      }
      catch { setWorkspace(local) }
    } else setWorkspace(local)
  })() }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('mindnotes-theme', theme) }, [theme])
  useEffect(() => {
    if (!workspace) return
    setSaved(false); const timer = setTimeout(async () => {
      const current = { ...workspace, updatedAt: now() }; await saveWorkspace(current)
      if (account.signedIn && navigator.onLine) await pushWorkspace(current).catch(() => {})
      setSaved(true)
    }, account.signedIn ? 900 : 260)
    return () => clearTimeout(timer)
  }, [workspace, account.signedIn])
  if (!workspace) return <div className="splash"><span className="brand-mark"><Network/></span><strong>MindNotes</strong></div>

  const update = (recipe: (draft: Workspace) => Workspace) => setWorkspace((old) => old ? { ...recipe(old), updatedAt: now() } : old)
  const createNote = () => {
    const note: Note = { id: uid(), title: '', body: '', folderId: selectedFolder, tags: [], linkedNoteIds: [], sourceIds: [], status: 'seed', favorite: false, color: colors[workspace.notes.length % colors.length], createdAt: now(), updatedAt: now() }
    update((old) => ({ ...old, notes: [note, ...old.notes] })); setEditorId(note.id)
  }
  const createNoteFromSource = (source: Source, phrase: string, targetId?: string) => {
    const clean = phrase.replace(/\s+/g, ' ').trim()
    if (!clean) return
    if (targetId) {
      update((old) => ({ ...old, notes: old.notes.map((note) => note.id === targetId ? {
        ...note, body: `${note.body}${note.body ? '\n\n' : ''}> ${clean}`,
        sourceIds: [...new Set([...note.sourceIds, source.id])],
        excerpts: [...(note.excerpts || []), { id: uid(), sourceId: source.id, text: clean, createdAt: now() }], updatedAt: now(),
      } : note) }))
      setEditorId(targetId); setView('notes'); return
    }
    const note: Note = { id: uid(), title: `From ${source.title}`, body: `> ${clean}`, folderId: selectedFolder, tags: [], linkedNoteIds: [], sourceIds: [source.id], excerpts: [{ id: uid(), sourceId: source.id, text: clean, createdAt: now() }], status: 'seed', favorite: false, color: colors[workspace.notes.length % colors.length], createdAt: now(), updatedAt: now() }
    update((old) => ({ ...old, notes: [note, ...old.notes] })); setEditorId(note.id); setSourceId(null); setView('notes')
  }
  const openNote = (id: string) => { setEditorId(id); setView('notes') }
  const counts = { notes: workspace.notes.length, sources: workspace.sources.length, tags: new Set(workspace.notes.flatMap((note) => note.tags)).size }
  const activeTitle = view === 'notes' ? selectedFolder ? workspace.folders.find((item) => item.id === selectedFolder)?.name || 'Notes' : 'All notes' : ({ map: 'Mind map', sources: 'Sources', search: 'Search', settings: 'Settings' } as const)[view]

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Network size={22}/></span><div><strong>MindNotes</strong><small>Think in connections</small></div><button className="mobile-close" aria-label="Close menu" onClick={() => setSidebar(false)}><X/></button></div>
      <nav>
        <Nav icon={<NotebookPen/>} label="Notes" count={counts.notes} active={view === 'notes'} onClick={() => {setView('notes'); setSidebar(false)}} />
        <Nav icon={<Network/>} label="Mind map" active={view === 'map'} onClick={() => {setView('map'); setSidebar(false)}} />
        <Nav icon={<BookOpen/>} label="Sources" count={counts.sources} active={view === 'sources'} onClick={() => {setView('sources'); setSidebar(false)}} />
        <Nav icon={<Search/>} label="Search" active={view === 'search'} onClick={() => {setView('search'); setSidebar(false)}} />
      </nav>
      <div className="sidebar-section"><div className="section-heading"><span>Folders</span><button aria-label="New folder" onClick={() => addFolder(update)}><FolderPlus size={17}/></button></div>
        <button className={!selectedFolder && view === 'notes' ? 'folder-item active' : 'folder-item'} onClick={() => {setSelectedFolder(null); setView('notes')}}><Archive/><span>All notes</span><small>{counts.notes}</small></button>
        {workspace.folders.map((folder) => <button key={folder.id} className={selectedFolder === folder.id && view === 'notes' ? 'folder-item active' : 'folder-item'} onClick={() => {setSelectedFolder(folder.id); setView('notes')}}><span className="folder-dot" style={{background: folder.color}}/><span>{folder.name}</span><small>{workspace.notes.filter((note) => note.folderId === folder.id).length}</small></button>)}
      </div>
      <div className="sidebar-footer"><button onClick={() => setView('settings')}><Settings/><span>Account & settings</span></button><div className="save-state"><span className={saved ? 'saved' : ''}>{saved ? <Check/> : <Cloud/>}</span>{saved ? account.signedIn ? 'Encrypted & synced' : 'Saved locally' : 'Saving…'}</div></div>
    </aside>
    {sidebar && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebar(false)}/>}
    <main>
      <header className="topbar"><button className="menu-button" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu/></button><span className="topbar-mark"><Network/></span><div><span className="eyebrow">MindNotes</span><h1>{activeTitle}</h1><p>Notes, sources, and connections</p></div><div className="top-actions"><button className="search-button" onClick={() => setView('search')}><Search/><span>Search anything</span><kbd>⌘ K</kbd></button><button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun/> : <Moon/>}</button>{view === 'notes' && <button className="button primary" onClick={createNote}><Plus/> New note</button>}</div></header>
      <div className="content">
        {view === 'notes' && <NotesView workspace={workspace} folderId={selectedFolder} onOpen={openNote} onCreate={createNote} onMap={() => setView('map')} update={update}/>}
        {view === 'map' && <GraphCanvas workspace={workspace} onOpenNote={openNote} onOpenSource={(id) => { setSourceId(id); setView('sources') }} onClose={() => setView('notes')}/>}
        {view === 'sources' && <SourcesView workspace={workspace} update={update} openId={sourceId} setOpenId={setSourceId} onCreateFromSource={createNoteFromSource}/>}
        {view === 'search' && <SearchView workspace={workspace} query={query} setQuery={setQuery} onOpen={openNote} onSource={(id) => {setSourceId(id); setView('sources')}}/>}
        {view === 'settings' && <SettingsView workspace={workspace} setWorkspace={setWorkspace} theme={theme} setTheme={setTheme} account={account} setAccount={setAccount}/>}
      </div>
    </main>
    {editorId && <NoteEditor note={workspace.notes.find((note) => note.id === editorId)!} workspace={workspace} update={update} onClose={() => setEditorId(null)} onDelete={() => {update((old) => ({...old, notes: old.notes.filter((note) => note.id !== editorId).map((note) => ({...note, linkedNoteIds: note.linkedNoteIds.filter((id) => id !== editorId)}))})); setEditorId(null)}}/>}
  </div>
}

function Nav({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}</button> }

function NotesView({ workspace, folderId, onOpen, onCreate, onMap, update }: { workspace: Workspace; folderId: string | null; onOpen: (id: string) => void; onCreate: () => void; onMap: () => void; update:(fn:(w:Workspace)=>Workspace)=>void }) {
  const [sort, setSort] = useState<'updated' | 'created' | 'title' | 'oldest'>('updated')
  const [tag, setTag] = useState(''), [noteQuery,setNoteQuery]=useState(''), [content,setContent]=useState('all'), [days,setDays]=useState('any'), [filtersOpen,setFiltersOpen]=useState(true)
  const [visible, setVisible] = useState(120), [layout, setLayout] = useState<'list'|'folders'>('list')
  const [selecting,setSelecting]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set())
  const notes = useMemo(() => workspace.notes.filter((note) => {
    if(folderId&&note.folderId!==folderId)return false;if(tag&&!note.tags.includes(tag))return false
    const q=noteQuery.trim().toLowerCase();if(q&&!`${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(q))return false
    if(content==='tagged'&&!note.tags.length)return false;if(content==='untagged'&&note.tags.length)return false;if(content==='linked'&&!note.linkedNoteIds.length)return false;if(content==='sources'&&!note.sourceIds.length)return false
    if(days!=='any'&&Date.now()-Date.parse(note.updatedAt)>Number(days)*86400000)return false;return true
  }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='created'?b.createdAt.localeCompare(a.createdAt):sort==='oldest'?a.updatedAt.localeCompare(b.updatedAt):b.updatedAt.localeCompare(a.updatedAt)), [workspace, folderId, tag, sort,noteQuery,content,days])
  const tags = [...new Set(workspace.notes.flatMap((note) => note.tags))].sort()
  function toggleSelected(id:string){setSelected((old)=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})}
  function deleteSelected(){if(!selected.size||!confirm(`Delete ${selected.size} selected notes?`))return;update((old)=>({...old,notes:old.notes.filter((note)=>!selected.has(note.id)).map((note)=>({...note,linkedNoteIds:note.linkedNoteIds.filter((id)=>!selected.has(id))}))}));setSelected(new Set());setSelecting(false)}
  function moveSelected(folderId:string){update((old)=>({...old,notes:old.notes.map((note)=>selected.has(note.id)?{...note,folderId:folderId||null,updatedAt:now()}:note)}));setSelected(new Set());setSelecting(false)}
  function copySelected(){const time=now();update((old)=>({...old,notes:[...old.notes.filter((note)=>selected.has(note.id)).map((note)=>({...note,id:uid(),title:`${note.title} (copy)`,linkedNoteIds:[],createdAt:time,updatedAt:time})),...old.notes]}));setSelected(new Set());setSelecting(false)}
  async function shareSelected(){const text=workspace.notes.filter((note)=>selected.has(note.id)).map((note)=>`${note.title}\n${note.body}`).join('\n\n———\n\n');if(navigator.share)await navigator.share({title:'MindNotes',text});else await navigator.clipboard.writeText(text)}
  const noteCard = (note: Note, index: number) => <article className={`note-card ${selected.has(note.id)?'selected':''}`} key={note.id} style={{'--accent': note.color, '--order': Math.min(index, 20)} as React.CSSProperties} onClick={() => selecting?toggleSelected(note.id):onOpen(note.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && (selecting?toggleSelected(note.id):onOpen(note.id))}>
    <div className="note-top"><span className={`status ${note.status}`}>{note.status}</span>{note.favorite && <Star className="favorite" fill="currentColor"/>}</div><h3>{note.title || 'Untitled note'}</h3><p>{note.body || 'Empty note'}</p>
    <div className="note-tags">{note.tags.slice(0,3).map((item) => <span key={item}>#{item}</span>)}</div><footer><span>{new Date(note.updatedAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span><span><Link2/> {note.linkedNoteIds.length}</span><span><BookOpen/> {note.sourceIds.length}</span></footer>
  </article>
  const folderGroups = [{ id: '', name: 'Unfiled notes' }, ...workspace.folders].map((folder) => ({ ...folder, notes: notes.filter((note) => (note.folderId || '') === folder.id) })).filter((group) => group.notes.length)
  return <section className="notes-view"><div className="view-intro"><div><h2>Notes</h2><p>{notes.length} saved {notes.length === 1 ? 'note' : 'notes'}</p></div><div className="notes-head-actions"><button className={`button ${selecting?'active':''}`} onClick={()=>{setSelecting(!selecting);setSelected(new Set())}}><SquareDashed/> Select</button><label className="select"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="created">Newest created</option><option value="title">Title A–Z</option><option value="oldest">Oldest updated</option></select><ChevronDown/></label></div></div>
    <div className="notes-layout-row"><div className="notes-view-switch" role="group" aria-label="View notes as"><button className={layout==='list'?'active':''} onClick={()=>setLayout('list')} aria-pressed={layout==='list'}><List/> List</button><button className={layout==='folders'?'active':''} onClick={()=>setLayout('folders')} aria-pressed={layout==='folders'}><Folders/> Folders</button><button onClick={onMap}><Network/> Mind map</button></div><button className="button" onClick={()=>addFolder(update)}><FolderPlus/> New folder</button></div>
    <div className="notes-discovery"><div className="notes-inline-search"><Search/><input value={noteQuery} onChange={(e)=>setNoteQuery(e.target.value)} placeholder="Search notes, hashtags, or phrases"/>{noteQuery&&<button onClick={()=>setNoteQuery('')}><X/></button>}</div><button className="button" onClick={()=>setFiltersOpen(!filtersOpen)}><Filter/> Filters <ChevronDown className={filtersOpen?'turned':''}/></button>{filtersOpen&&<div className="notes-advanced-filters"><label><span>Content</span><select value={content} onChange={(e)=>setContent(e.target.value)}><option value="all">Any content</option><option value="sources">Has sources</option><option value="linked">Has links</option><option value="tagged">Has hashtags</option><option value="untagged">No hashtags</option></select></label><label><span>Updated</span><select value={days} onChange={(e)=>setDays(e.target.value)}><option value="any">Any time</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="365">Past year</option></select></label></div>}</div>
    {selecting&&<div className="selection-bar"><strong>{selected.size} selected</strong><button className="button" onClick={()=>setSelected(new Set(notes.map((note)=>note.id)))}><Check/> Select all</button><label className="selection-move"><Folder/><select aria-label="Move selected notes" disabled={!selected.size} defaultValue="__choose" onChange={(event)=>moveSelected(event.target.value)}><option value="__choose" disabled>Move to…</option><option value="">No folder</option>{workspace.folders.map((folder)=><option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label><button className="button" onClick={copySelected} disabled={!selected.size}><Copy/> Copy</button><button className="button" onClick={shareSelected} disabled={!selected.size}><Share2/> Share</button><button className="button danger" onClick={deleteSelected} disabled={!selected.size}><Trash2/> Delete</button></div>}
    {tags.length > 0 && <div className="chips"><button className={!tag ? 'active' : ''} onClick={() => setTag('')}>All</button>{tags.map((item) => <button key={item} className={tag === item ? 'active' : ''} onClick={() => setTag(item)}>#{item}</button>)}</div>}
    {notes.length ? <>{layout === 'list' ? <div className={`notes-grid ${selecting?'selecting':''}`}>{notes.slice(0, visible).map(noteCard)}</div> : <div className="note-folder-browser">{folderGroups.map((group) => <section className="folder-group" key={group.id}><header><span className="folder-icon"><Folder/></span><div><h3>{group.name}</h3><small>{group.notes.length} {group.notes.length === 1 ? 'note' : 'notes'}</small></div></header><div className={`notes-grid ${selecting?'selecting':''}`}>{group.notes.slice(0, visible).map(noteCard)}</div></section>)}</div>}{visible < notes.length && <div className="load-more"><button className="button" onClick={() => setVisible((amount) => amount + 120)}>Show more notes <small>{notes.length - visible} remaining</small></button></div>}</> : <Empty icon={<NotebookPen/>} title="A quiet space, for now" text="Create your first note and start connecting what you know." action="Create note" onAction={onCreate}/>}
  </section>
}

function NoteEditor({ note, workspace, update, onClose, onDelete }: { note: Note; workspace: Workspace; update: (fn: (w: Workspace) => Workspace) => void; onClose: () => void; onDelete: () => void }) {
  const change = (patch: Partial<Note>) => update((old) => ({...old, notes: old.notes.map((item) => item.id === note.id ? {...item, ...patch, updatedAt: now()} : item)}))
  const [tagText, setTagText] = useState('')
  return <div className="editor-layer"><button className="editor-scrim" aria-label="Close editor" onClick={onClose}/><aside className="editor-panel">
    <header><button className="icon-button" onClick={onClose}><ArrowLeft/></button><div className="editor-state"><span/><small>Saved automatically</small></div><button className="icon-button" aria-label="Share note" onClick={async()=>{const text=`${note.title}\n\n${note.body}`;if(navigator.share)await navigator.share({title:note.title||'MindNotes',text});else await navigator.clipboard.writeText(text)}}><Share2/></button><button className="icon-button danger" aria-label="Delete note" onClick={() => confirm('Delete this note?') && onDelete()}><Trash2/></button><button className="icon-button" aria-label="Close" onClick={onClose}><X/></button></header>
    <div className="editor-scroll"><input className="title-input" value={note.title} onChange={(e) => change({title: e.target.value})} placeholder="Untitled thought" aria-label="Note title"/>
      <div className="format-bar"><button onClick={() => change({body: `${note.body}**bold**`})}><b>B</b></button><button onClick={() => change({body: `${note.body}_italic_`})}><i>I</i></button><button onClick={() => change({body: `${note.body}\n## Heading`})}>H₂</button><button onClick={() => change({body: `${note.body}\n- `})}>• List</button><button onClick={() => change({body: `${note.body}\n> `})}>“ Quote</button></div>
      <textarea className="body-input" value={note.body} onChange={(e) => change({body: e.target.value})} placeholder="Start writing…" aria-label="Note content"/>
      <EditorSection icon={<Hash/>} title="Hashtags"><div className="tag-editor">{note.tags.map((tag) => <button key={tag} onClick={() => change({tags: note.tags.filter((item) => item !== tag)})}>#{tag} <X/></button>)}<input value={tagText} placeholder="Add hashtag" onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => {if ((e.key === 'Enter' || e.key === ',') && tagText.trim()) {e.preventDefault(); change({tags: [...new Set([...note.tags, tagText.trim().replace(/^#/, '').toLowerCase()])]}); setTagText('')}}}/></div></EditorSection>
      <EditorSection icon={<Folder/>} title="Folder"><select value={note.folderId || ''} onChange={(e) => change({folderId: e.target.value || null})}><option value="">No folder</option>{workspace.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></EditorSection>
      <EditorSection icon={<Link2/>} title="Linked notes"><div className="check-list">{workspace.notes.filter((item) => item.id !== note.id).map((item) => <label key={item.id}><input type="checkbox" checked={note.linkedNoteIds.includes(item.id)} onChange={() => change({linkedNoteIds: toggle(note.linkedNoteIds, item.id)})}/><span>{item.title || 'Untitled note'}</span></label>)}</div></EditorSection>
      <EditorSection icon={<BookOpen/>} title="Sources"><div className="check-list">{workspace.sources.map((source) => <label key={source.id}><input type="checkbox" checked={note.sourceIds.includes(source.id)} onChange={() => change({sourceIds: toggle(note.sourceIds, source.id)})}/><span>{source.title}</span><small>{sourceIcons[source.kind]}</small></label>)}</div></EditorSection>
      {!!note.excerpts?.length && <EditorSection icon={<Quote/>} title="Saved source phrases"><div className="saved-excerpts">{note.excerpts.map((excerpt) => <blockquote key={excerpt.id}><p>{excerpt.text}</p><footer><span>{workspace.sources.find((source) => source.id === excerpt.sourceId)?.title || 'Removed source'}</span><button aria-label="Remove excerpt" onClick={() => change({ excerpts: note.excerpts?.filter((item) => item.id !== excerpt.id) })}><X/></button></footer></blockquote>)}</div></EditorSection>}
      <EditorSection icon={<Sparkles/>} title="Note state"><div className="segmented">{(['seed','growing','evergreen'] as const).map((status) => <button className={note.status === status ? 'active' : ''} key={status} onClick={() => change({status})}>{status}</button>)}</div><label className="favorite-toggle"><input type="checkbox" checked={note.favorite} onChange={(e) => change({favorite: e.target.checked})}/> Favourite note</label></EditorSection>
    </div></aside></div>
}

function EditorSection({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}) { return <section className="editor-section"><h3>{icon}{title}</h3>{children}</section> }

function SourcesView({workspace, update, openId, setOpenId, onCreateFromSource}:{workspace:Workspace;update:(fn:(w:Workspace)=>Workspace)=>void;openId:string|null;setOpenId:(id:string|null)=>void;onCreateFromSource:(source:Source,phrase:string,targetId?:string)=>void}) {
  const fileRef = useRef<HTMLInputElement>(null), readerTextRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false), [url, setUrl] = useState(''), [manual, setManual] = useState(''), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error,setError]=useState(''), [selectedText,setSelectedText]=useState(''), [targetNote,setTargetNote]=useState('')
  const add = (source: Omit<Source,'id'|'createdAt'|'updatedAt'>) => {const time=now();update((old)=>({...old,sources:[{...source,id:uid(),createdAt:time,updatedAt:time},...old.sources]}));setAdding(false);setTitle('');setManual('');setUrl('')}
  async function files(files: FileList|null) { if(!files)return;setBusy(true);setError('');try{for(const file of [...files]){let result;try{result=await extractFile(file)}catch{result=await extractFileOnServer(file)}add({title:file.name,kind:result.kind,text:result.text,fileName:file.name})}}catch(e){setError(e instanceof Error?e.message:'Import failed')}finally{setBusy(false)}}
  async function remote() { setBusy(true);setError('');try{const result=await extractRemote(url);add({...result,url})}catch(e){setError(e instanceof Error?e.message:'Import failed')}finally{setBusy(false)}}
  const open=workspace.sources.find((item)=>item.id===openId)
  useEffect(()=>{setSelectedText('');setTargetNote('')},[openId])
  function capturePhrase(){const selection=window.getSelection();if(!selection||selection.isCollapsed||!readerTextRef.current)return;const anchor=selection.anchorNode,parent=anchor?.nodeType===Node.TEXT_NODE?anchor.parentElement:anchor as Element|null;if(!parent||!readerTextRef.current.contains(parent))return;setSelectedText(selection.toString().replace(/\s+/g,' ').trim().slice(0,12000))}
  useEffect(()=>{if(!openId)return;const capture=()=>requestAnimationFrame(capturePhrase);document.addEventListener('selectionchange',capture);return()=>document.removeEventListener('selectionchange',capture)},[openId])
  return <section><div className="view-intro"><div><h2>Your source library</h2><p>Import once. Read, search, and connect the extracted text everywhere.</p></div><button className="button primary" onClick={()=>setAdding(true)}><FilePlus2/> Add source</button></div>
    <div className="source-grid">{workspace.sources.map((source)=><article className="source-card" key={source.id} onClick={()=>setOpenId(source.id)}><span className={`file-kind ${source.kind}`}>{sourceIcons[source.kind]}</span><div><h3>{source.title}</h3><p>{source.text.slice(0,130)}</p><small>{source.text.split(/\s+/).length.toLocaleString()} words · {new Date(source.createdAt).toLocaleDateString()}</small></div></article>)}</div>
    {!workspace.sources.length&&<Empty icon={<BookOpen/>} title="Bring your sources together" text="PDFs, documents, presentations, spreadsheets, websites, videos, or your own text." action="Add a source" onAction={()=>setAdding(true)}/>}
    {adding&&<div className="modal-layer"><button className="modal-scrim" onClick={()=>setAdding(false)}/><div className="modal"><header><div><span className="eyebrow">Build your library</span><h2>Add a source</h2></div><button className="icon-button" onClick={()=>setAdding(false)}><X/></button></header><button className="drop-zone" onClick={()=>fileRef.current?.click()}><Upload/><strong>{busy?'Extracting text…':'Choose files'}</strong><span>PDF, Word, PowerPoint, Excel, CSV, text and more</span></button><input ref={fileRef} hidden multiple type="file" onChange={(e)=>files(e.target.files)}/><div className="or"><span>or</span></div><label>Website or YouTube URL<input type="url" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://…"/></label><button className="button" disabled={!url||busy} onClick={remote}><Link2/> Extract from URL</button><div className="or"><span>or paste text</span></div><label>Source title<input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Interview notes"/></label><textarea value={manual} onChange={(e)=>setManual(e.target.value)} placeholder="Paste or write source text…"/><button className="button primary" disabled={!manual.trim()} onClick={()=>add({title:title||'Plain text source',text:manual,kind:'text'})}>Save text source</button>{error&&<p className="error">{error}</p>}</div></div>}
    {open&&<div className="editor-layer"><button className="editor-scrim" onClick={()=>setOpenId(null)}/><aside className="source-reader"><header><span className={`file-kind ${open.kind}`}>{sourceIcons[open.kind]}</span><div><small>{open.kind} · {open.text.split(/\s+/).length.toLocaleString()} words</small><h2>{open.title}</h2></div><button className="icon-button danger" onClick={()=>{if(confirm('Delete this source?')){update((old)=>({...old,sources:old.sources.filter((item)=>item.id!==open.id),notes:old.notes.map((note)=>({...note,sourceIds:note.sourceIds.filter((id)=>id!==open.id),excerpts:note.excerpts?.filter((excerpt)=>excerpt.sourceId!==open.id)}))}));setOpenId(null)}}}><Trash2/></button><button className="icon-button" onClick={()=>setOpenId(null)}><X/></button></header><div className="source-reading-guide"><Quote/><span>Select any phrase in the extracted text. Then turn it into a new note or add it to an existing one.</span></div><div ref={readerTextRef} className="source-text" onPointerUp={capturePhrase} onKeyUp={capturePhrase} tabIndex={0}>{open.text}</div>{selectedText&&<div className="source-selection-bar" role="status"><div><span>Selected phrase</span><p>“{selectedText.slice(0,180)}{selectedText.length>180?'…':''}”</p></div><button className="button primary" onClick={()=>onCreateFromSource(open,selectedText)}><NotebookPen/> New note from phrase</button><label><span>Add to existing note</span><select value={targetNote} onChange={(event)=>setTargetNote(event.target.value)}><option value="">Choose a note…</option>{workspace.notes.map((note)=><option value={note.id} key={note.id}>{note.title||'Untitled note'}</option>)}</select></label><button className="button" disabled={!targetNote} onClick={()=>onCreateFromSource(open,selectedText,targetNote)}><Plus/> Add phrase</button><button className="icon-button" onClick={()=>{setSelectedText('');window.getSelection()?.removeAllRanges()}} aria-label="Clear selected phrase"><X/></button></div>}</aside></div>}
  </section>
}

function SearchView({workspace,query,setQuery,onOpen,onSource}:{workspace:Workspace;query:string;setQuery:(q:string)=>void;onOpen:(id:string)=>void;onSource:(id:string)=>void}) {
  const q=query.trim().toLowerCase(), notes=q?workspace.notes.filter((n)=>`${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(q)).slice(0,200):[], sources=q?workspace.sources.filter((s)=>`${s.title} ${s.text}`.toLowerCase().includes(q)).slice(0,200):[]
  return <section className="search-view"><div className="search-hero"><Search/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search notes, hashtags, and source text…"/><kbd>ESC</kbd></div>{q&&<div className="search-results"><h2>Notes <small>{notes.length}</small></h2>{notes.map((note)=><button onClick={()=>onOpen(note.id)} key={note.id}><NotebookPen/><span><strong>{note.title}</strong><small>{snippet(note.body,q)}</small></span></button>)}<h2>Sources <small>{sources.length}</small></h2>{sources.map((source)=><button onClick={()=>onSource(source.id)} key={source.id}><BookOpen/><span><strong>{source.title}</strong><small>{snippet(source.text,q)}</small></span></button>)}{!notes.length&&!sources.length&&<Empty icon={<Search/>} title="No matches" text="Try a different word or hashtag."/>}</div>}{!q&&<div className="search-prompts"><span>Search finds text inside every imported source.</span><div><button onClick={()=>setQuery('#')}># Hashtags</button><button onClick={()=>setQuery('welcome')}>Welcome</button><button onClick={()=>setQuery('source')}>Sources</button></div></div>}</section>
}

function SettingsView({workspace,setWorkspace,theme,setTheme,account,setAccount}:{workspace:Workspace;setWorkspace:(w:Workspace)=>void;theme:string;setTheme:(s:string)=>void;account:AccountState;setAccount:(a:AccountState)=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'register'|'login'>('register'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const importRef=useRef<HTMLInputElement>(null)
  async function submit(){setBusy(true);setMessage('');try{const user=await connect(email,password,mode==='register');setAccount({email:user.email,signedIn:true});if(mode==='register'){await pushWorkspace(workspace);setMessage('Account created. Your encrypted notes are now synced.')}else{const remote=await pullWorkspace();if(remote)setWorkspace(remote);else await pushWorkspace(workspace);setMessage('Signed in. Your encrypted notes are synced.')}setPassword('')}catch(e){setMessage(e instanceof Error?e.message:'Could not connect your account.')}finally{setBusy(false)}}
  async function signOut(){await logout();setAccount({email:'',signedIn:false});setMessage('Signed out. Your notes remain saved locally on this device.')}
  function download(){const blob=new Blob([JSON.stringify(workspace,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mindnotes-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
  async function importBackup(file?:File){if(!file)return;try{const value=JSON.parse(await file.text());if(value.version!==1||!Array.isArray(value.notes)||!Array.isArray(value.folders)||!Array.isArray(value.sources))throw new Error('This is not a valid MindNotes backup.');setWorkspace(value);setMessage('Backup imported. It will now save in your current local or account mode.')}catch(e){setMessage(e instanceof Error?e.message:'Could not import this backup.')}finally{if(importRef.current)importRef.current.value=''}}
  return <section className="settings-view"><div className="view-intro"><div><h2>Account & settings</h2><p>Use MindNotes locally, or create one account to keep everything encrypted and synced.</p></div></div><div className="settings-grid"><article className="account-card"><header><Cloud/><div><h3>{account.signedIn?'Your account':'Sync every device'}</h3><p>{account.signedIn?`Signed in as ${account.email}`:'The server stores encrypted data. Only your password can unlock it.'}</p></div></header>{account.signedIn?<><div className="account-success"><Check/><span><strong>Encrypted sync is on</strong><small>Changes save automatically to this device and the server.</small></span></div><button className="button" onClick={signOut}>Sign out and use local only</button></>:<><div className="segmented account-tabs"><button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>Create account</button><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Sign in</button></div><label>Email<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com"/></label><label>Password<input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" autoComplete={mode==='register'?'new-password':'current-password'} placeholder="At least 8 characters"/></label><button className="button primary account-submit" disabled={busy||!email||password.length<8} onClick={submit}>{busy?'Please wait…':mode==='register'?'Create account and sync':'Sign in and sync'}</button><small className="privacy-note">Your notes are encrypted in this browser before they reach the server.</small></>}</article><article><header><Moon/><div><h3>Appearance</h3><p>Choose the space that feels best.</p></div></header><div className="segmented"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/> Light</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/> Dark</button></div></article><article><header><Download/><div><h3>Portable backup</h3><p>Export or restore your complete workspace.</p></div></header><div className="button-row"><button className="button" onClick={download}><Download/> Export JSON</button><button className="button" onClick={()=>importRef.current?.click()}><Upload/> Import backup</button></div><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(e)=>importBackup(e.target.files?.[0])}/></article><article><header><CircleHelp/><div><h3>Local mode & Android</h3><p>No account is required. IndexedDB keeps your workspace on this device.</p></div></header><small>No analytics · No tracking · Local-first</small><a className="button apk-download" href="https://github.com/Aboss3b13/MindNote/releases/download/v0.3.0/MindNotes-v0.3.0-debug.apk"><Download/> Download Android APK</a></article></div>{message&&<div className="toast">{message}</div>}</section>
}

function Empty({icon,title,text,action,onAction}:{icon:React.ReactNode;title:string;text:string;action?:string;onAction?:()=>void}) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action&&<button className="button primary" onClick={onAction}><Plus/>{action}</button>}</div> }
function toggle(values:string[],value:string){return values.includes(value)?values.filter((item)=>item!==value):[...values,value]}
function snippet(text:string,q:string){const at=text.toLowerCase().indexOf(q);return text.slice(Math.max(0,at-45),Math.max(100,at+100)).replace(/\s+/g,' ')}
function addFolder(update:(fn:(w:Workspace)=>Workspace)=>void){const name=prompt('Folder name');if(!name?.trim())return;const folder:FolderType={id:uid(),name:name.trim(),parentId:null,color:colors[Math.floor(Math.random()*colors.length)],createdAt:now()};update((old)=>({...old,folders:[...old.folders,folder]}))}
