import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, BookOpen, Check, ChevronDown, CircleHelp, Cloud, Download, FilePlus2, Folder, FolderPlus, Hash, Link2, Menu, Moon, Network, NotebookPen, PanelLeftClose, Plus, Search, Settings, Sparkles, Star, Sun, Trash2, Upload, X } from 'lucide-react'
import GraphCanvas from './GraphCanvas'
import { extractFile, extractRemote } from './importers'
import { freshWorkspace, loadWorkspace, saveWorkspace } from './db'
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

  useEffect(() => { loadWorkspace().then((stored) => setWorkspace(stored.notes.length || stored.sources.length ? stored : freshWorkspace())) }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('mindnotes-theme', theme) }, [theme])
  useEffect(() => {
    if (!workspace) return
    setSaved(false); const timer = setTimeout(() => saveWorkspace({ ...workspace, updatedAt: now() }).then(() => setSaved(true)), 260)
    return () => clearTimeout(timer)
  }, [workspace])
  if (!workspace) return <div className="splash"><span className="brand-mark"><Network/></span><strong>MindNotes</strong></div>

  const update = (recipe: (draft: Workspace) => Workspace) => setWorkspace((old) => old ? recipe(old) : old)
  const createNote = () => {
    const note: Note = { id: uid(), title: '', body: '', folderId: selectedFolder, tags: [], linkedNoteIds: [], sourceIds: [], status: 'seed', favorite: false, color: colors[workspace.notes.length % colors.length], createdAt: now(), updatedAt: now() }
    update((old) => ({ ...old, notes: [note, ...old.notes] })); setEditorId(note.id)
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
      <div className="sidebar-footer"><button onClick={() => setView('settings')}><Settings/><span>Settings & sync</span></button><div className="save-state"><span className={saved ? 'saved' : ''}>{saved ? <Check/> : <Cloud/>}</span>{saved ? 'Saved locally' : 'Saving…'}</div></div>
    </aside>
    {sidebar && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebar(false)}/>}
    <main>
      <header className="topbar"><button className="menu-button" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu/></button><div><span className="eyebrow">Your knowledge space</span><h1>{activeTitle}</h1></div><div className="top-actions"><button className="search-button" onClick={() => setView('search')}><Search/><span>Search anything</span><kbd>⌘ K</kbd></button><button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun/> : <Moon/>}</button>{view === 'notes' && <button className="button primary" onClick={createNote}><Plus/> New note</button>}</div></header>
      <div className="content">
        {view === 'notes' && <NotesView workspace={workspace} folderId={selectedFolder} onOpen={openNote} onCreate={createNote}/>}
        {view === 'map' && <GraphCanvas workspace={workspace} onOpenNote={openNote}/>}
        {view === 'sources' && <SourcesView workspace={workspace} update={update} openId={sourceId} setOpenId={setSourceId}/>}
        {view === 'search' && <SearchView workspace={workspace} query={query} setQuery={setQuery} onOpen={openNote} onSource={(id) => {setSourceId(id); setView('sources')}}/>}
        {view === 'settings' && <SettingsView workspace={workspace} setWorkspace={setWorkspace} theme={theme} setTheme={setTheme}/>}
      </div>
    </main>
    {editorId && <NoteEditor note={workspace.notes.find((note) => note.id === editorId)!} workspace={workspace} update={update} onClose={() => setEditorId(null)} onDelete={() => {update((old) => ({...old, notes: old.notes.filter((note) => note.id !== editorId).map((note) => ({...note, linkedNoteIds: note.linkedNoteIds.filter((id) => id !== editorId)}))})); setEditorId(null)}}/>}
  </div>
}

function Nav({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) { return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}</button> }

function NotesView({ workspace, folderId, onOpen, onCreate }: { workspace: Workspace; folderId: string | null; onOpen: (id: string) => void; onCreate: () => void }) {
  const [sort, setSort] = useState<'updated' | 'title'>('updated')
  const [tag, setTag] = useState('')
  const [visible, setVisible] = useState(120)
  const notes = useMemo(() => workspace.notes.filter((note) => (!folderId || note.folderId === folderId) && (!tag || note.tags.includes(tag))).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [workspace, folderId, tag, sort])
  const tags = [...new Set(workspace.notes.flatMap((note) => note.tags))].sort()
  return <section><div className="view-intro"><div><h2>{notes.length} {notes.length === 1 ? 'thought' : 'thoughts'}</h2><p>Capture ideas, connect context, and let patterns emerge.</p></div><label className="select"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="title">Title</option></select><ChevronDown/></label></div>
    {tags.length > 0 && <div className="chips"><button className={!tag ? 'active' : ''} onClick={() => setTag('')}>All</button>{tags.map((item) => <button key={item} className={tag === item ? 'active' : ''} onClick={() => setTag(item)}>#{item}</button>)}</div>}
    {notes.length ? <><div className="notes-grid">{notes.slice(0, visible).map((note, index) => <article className="note-card" key={note.id} style={{'--accent': note.color, '--order': Math.min(index, 20)} as React.CSSProperties} onClick={() => onOpen(note.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(note.id)}>
      <div className="note-top"><span className={`status ${note.status}`}>{note.status}</span>{note.favorite && <Star className="favorite" fill="currentColor"/>}</div><h3>{note.title || 'Untitled note'}</h3><p>{note.body || 'Empty note'}</p>
      <div className="note-tags">{note.tags.slice(0,3).map((item) => <span key={item}>#{item}</span>)}</div><footer><span>{new Date(note.updatedAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span><span><Link2/> {note.linkedNoteIds.length}</span><span><BookOpen/> {note.sourceIds.length}</span></footer>
    </article>)}</div>{visible < notes.length && <div className="load-more"><button className="button" onClick={() => setVisible((amount) => amount + 120)}>Show more notes <small>{notes.length - visible} remaining</small></button></div>}</> : <Empty icon={<NotebookPen/>} title="A quiet space, for now" text="Create your first note and start connecting what you know." action="Create note" onAction={onCreate}/>}
  </section>
}

function NoteEditor({ note, workspace, update, onClose, onDelete }: { note: Note; workspace: Workspace; update: (fn: (w: Workspace) => Workspace) => void; onClose: () => void; onDelete: () => void }) {
  const change = (patch: Partial<Note>) => update((old) => ({...old, notes: old.notes.map((item) => item.id === note.id ? {...item, ...patch, updatedAt: now()} : item)}))
  const [tagText, setTagText] = useState('')
  return <div className="editor-layer"><button className="editor-scrim" aria-label="Close editor" onClick={onClose}/><aside className="editor-panel">
    <header><button className="icon-button" onClick={onClose}><ArrowLeft/></button><div className="editor-state"><span/><small>Saved automatically</small></div><button className="icon-button danger" aria-label="Delete note" onClick={() => confirm('Delete this note?') && onDelete()}><Trash2/></button><button className="icon-button" aria-label="Close" onClick={onClose}><X/></button></header>
    <div className="editor-scroll"><input className="title-input" value={note.title} onChange={(e) => change({title: e.target.value})} placeholder="Untitled thought" aria-label="Note title"/>
      <div className="format-bar"><button onClick={() => change({body: `${note.body}**bold**`})}><b>B</b></button><button onClick={() => change({body: `${note.body}_italic_`})}><i>I</i></button><button onClick={() => change({body: `${note.body}\n## Heading`})}>H₂</button><button onClick={() => change({body: `${note.body}\n- `})}>• List</button><button onClick={() => change({body: `${note.body}\n> `})}>“ Quote</button></div>
      <textarea className="body-input" value={note.body} onChange={(e) => change({body: e.target.value})} placeholder="Start writing…" aria-label="Note content"/>
      <EditorSection icon={<Hash/>} title="Hashtags"><div className="tag-editor">{note.tags.map((tag) => <button key={tag} onClick={() => change({tags: note.tags.filter((item) => item !== tag)})}>#{tag} <X/></button>)}<input value={tagText} placeholder="Add hashtag" onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => {if ((e.key === 'Enter' || e.key === ',') && tagText.trim()) {e.preventDefault(); change({tags: [...new Set([...note.tags, tagText.trim().replace(/^#/, '').toLowerCase()])]}); setTagText('')}}}/></div></EditorSection>
      <EditorSection icon={<Folder/>} title="Folder"><select value={note.folderId || ''} onChange={(e) => change({folderId: e.target.value || null})}><option value="">No folder</option>{workspace.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></EditorSection>
      <EditorSection icon={<Link2/>} title="Linked notes"><div className="check-list">{workspace.notes.filter((item) => item.id !== note.id).map((item) => <label key={item.id}><input type="checkbox" checked={note.linkedNoteIds.includes(item.id)} onChange={() => change({linkedNoteIds: toggle(note.linkedNoteIds, item.id)})}/><span>{item.title || 'Untitled note'}</span></label>)}</div></EditorSection>
      <EditorSection icon={<BookOpen/>} title="Sources"><div className="check-list">{workspace.sources.map((source) => <label key={source.id}><input type="checkbox" checked={note.sourceIds.includes(source.id)} onChange={() => change({sourceIds: toggle(note.sourceIds, source.id)})}/><span>{source.title}</span><small>{sourceIcons[source.kind]}</small></label>)}</div></EditorSection>
      <EditorSection icon={<Sparkles/>} title="Note state"><div className="segmented">{(['seed','growing','evergreen'] as const).map((status) => <button className={note.status === status ? 'active' : ''} key={status} onClick={() => change({status})}>{status}</button>)}</div><label className="favorite-toggle"><input type="checkbox" checked={note.favorite} onChange={(e) => change({favorite: e.target.checked})}/> Favourite note</label></EditorSection>
    </div></aside></div>
}

function EditorSection({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}) { return <section className="editor-section"><h3>{icon}{title}</h3>{children}</section> }

function SourcesView({workspace, update, openId, setOpenId}:{workspace:Workspace;update:(fn:(w:Workspace)=>Workspace)=>void;openId:string|null;setOpenId:(id:string|null)=>void}) {
  const fileRef = useRef<HTMLInputElement>(null), [adding, setAdding] = useState(false), [url, setUrl] = useState(''), [manual, setManual] = useState(''), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error,setError]=useState('')
  const add = (source: Omit<Source,'id'|'createdAt'|'updatedAt'>) => {const time=now();update((old)=>({...old,sources:[{...source,id:uid(),createdAt:time,updatedAt:time},...old.sources]}));setAdding(false);setTitle('');setManual('');setUrl('')}
  async function files(files: FileList|null) { if(!files)return;setBusy(true);setError('');try{for(const file of [...files]){const result=await extractFile(file);add({title:file.name,kind:result.kind,text:result.text,fileName:file.name})}}catch(e){setError(e instanceof Error?e.message:'Import failed')}finally{setBusy(false)}}
  async function remote() { const server=localStorage.getItem('mindnotes-server')||'',token=localStorage.getItem('mindnotes-token')||'';if(!server||!token){setError('Add your private sync server and access token in Settings first.');return}setBusy(true);try{const result=await extractRemote(server,token,url);add({...result,url})}catch(e){setError(e instanceof Error?e.message:'Import failed')}finally{setBusy(false)}}
  const open=workspace.sources.find((item)=>item.id===openId)
  return <section><div className="view-intro"><div><h2>Your source library</h2><p>Import once. Read, search, and connect the extracted text everywhere.</p></div><button className="button primary" onClick={()=>setAdding(true)}><FilePlus2/> Add source</button></div>
    <div className="source-grid">{workspace.sources.map((source)=><article className="source-card" key={source.id} onClick={()=>setOpenId(source.id)}><span className={`file-kind ${source.kind}`}>{sourceIcons[source.kind]}</span><div><h3>{source.title}</h3><p>{source.text.slice(0,130)}</p><small>{source.text.split(/\s+/).length.toLocaleString()} words · {new Date(source.createdAt).toLocaleDateString()}</small></div></article>)}</div>
    {!workspace.sources.length&&<Empty icon={<BookOpen/>} title="Bring your sources together" text="PDFs, documents, presentations, spreadsheets, websites, videos, or your own text." action="Add a source" onAction={()=>setAdding(true)}/>}
    {adding&&<div className="modal-layer"><button className="modal-scrim" onClick={()=>setAdding(false)}/><div className="modal"><header><div><span className="eyebrow">Build your library</span><h2>Add a source</h2></div><button className="icon-button" onClick={()=>setAdding(false)}><X/></button></header><button className="drop-zone" onClick={()=>fileRef.current?.click()}><Upload/><strong>{busy?'Extracting text…':'Choose files'}</strong><span>PDF, Word, PowerPoint, Excel, CSV, text and more</span></button><input ref={fileRef} hidden multiple type="file" onChange={(e)=>files(e.target.files)}/><div className="or"><span>or</span></div><label>Website or YouTube URL<input type="url" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://…"/></label><button className="button" disabled={!url||busy} onClick={remote}><Link2/> Extract from URL</button><div className="or"><span>or paste text</span></div><label>Source title<input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Interview notes"/></label><textarea value={manual} onChange={(e)=>setManual(e.target.value)} placeholder="Paste or write source text…"/><button className="button primary" disabled={!manual.trim()} onClick={()=>add({title:title||'Plain text source',text:manual,kind:'text'})}>Save text source</button>{error&&<p className="error">{error}</p>}</div></div>}
    {open&&<div className="editor-layer"><button className="editor-scrim" onClick={()=>setOpenId(null)}/><aside className="source-reader"><header><span className={`file-kind ${open.kind}`}>{sourceIcons[open.kind]}</span><div><small>{open.kind}</small><h2>{open.title}</h2></div><button className="icon-button danger" onClick={()=>{if(confirm('Delete this source?')){update((old)=>({...old,sources:old.sources.filter((item)=>item.id!==open.id),notes:old.notes.map((note)=>({...note,sourceIds:note.sourceIds.filter((id)=>id!==open.id)}))}));setOpenId(null)}}}><Trash2/></button><button className="icon-button" onClick={()=>setOpenId(null)}><X/></button></header><div className="source-text">{open.text}</div></aside></div>}
  </section>
}

function SearchView({workspace,query,setQuery,onOpen,onSource}:{workspace:Workspace;query:string;setQuery:(q:string)=>void;onOpen:(id:string)=>void;onSource:(id:string)=>void}) {
  const q=query.trim().toLowerCase(), notes=q?workspace.notes.filter((n)=>`${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(q)).slice(0,200):[], sources=q?workspace.sources.filter((s)=>`${s.title} ${s.text}`.toLowerCase().includes(q)).slice(0,200):[]
  return <section className="search-view"><div className="search-hero"><Search/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search notes, hashtags, and source text…"/><kbd>ESC</kbd></div>{q&&<div className="search-results"><h2>Notes <small>{notes.length}</small></h2>{notes.map((note)=><button onClick={()=>onOpen(note.id)} key={note.id}><NotebookPen/><span><strong>{note.title}</strong><small>{snippet(note.body,q)}</small></span></button>)}<h2>Sources <small>{sources.length}</small></h2>{sources.map((source)=><button onClick={()=>onSource(source.id)} key={source.id}><BookOpen/><span><strong>{source.title}</strong><small>{snippet(source.text,q)}</small></span></button>)}{!notes.length&&!sources.length&&<Empty icon={<Search/>} title="No matches" text="Try a different word or hashtag."/>}</div>}{!q&&<div className="search-prompts"><span>Search finds text inside every imported source.</span><div><button onClick={()=>setQuery('#')}># Hashtags</button><button onClick={()=>setQuery('welcome')}>Welcome</button><button onClick={()=>setQuery('source')}>Sources</button></div></div>}</section>
}

function SettingsView({workspace,setWorkspace,theme,setTheme}:{workspace:Workspace;setWorkspace:(w:Workspace)=>void;theme:string;setTheme:(s:string)=>void}) {
  const [server,setServer]=useState(localStorage.getItem('mindnotes-server')||''),[token,setToken]=useState(localStorage.getItem('mindnotes-token')||''),[message,setMessage]=useState('')
  async function push(){try{const response=await fetch(`${server.replace(/\/$/,'')}/api/workspace`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(workspace)});if(!response.ok)throw new Error();setMessage('Workspace backed up to your server.')}catch{setMessage('Could not reach the private sync server.')}}
  async function pull(){try{const response=await fetch(`${server.replace(/\/$/,'')}/api/workspace`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error();const data=await response.json();setWorkspace(data);setMessage('Workspace restored from your server.')}catch{setMessage('Could not restore from the private sync server.')}}
  function saveServer(){localStorage.setItem('mindnotes-server',server);localStorage.setItem('mindnotes-token',token);setMessage('Private connection saved on this device only.')}
  function download(){const blob=new Blob([JSON.stringify(workspace,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mindnotes-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
  return <section className="settings-view"><div className="view-intro"><div><h2>Settings & privacy</h2><p>Your notes stay on your device unless you explicitly connect your private server.</p></div></div><div className="settings-grid"><article><header><Moon/><div><h3>Appearance</h3><p>Choose the space that feels best.</p></div></header><div className="segmented"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/> Light</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/> Dark</button></div></article><article><header><Cloud/><div><h3>Private server</h3><p>Optional self-hosted backup and URL extraction.</p></div></header><label>Server URL<input value={server} onChange={(e)=>setServer(e.target.value)} placeholder="https://notes.example.com"/></label><label>Access token<input value={token} onChange={(e)=>setToken(e.target.value)} type="password" placeholder="Stored only on this device"/></label><div className="button-row"><button className="button" onClick={saveServer}>Save connection</button><button className="button" disabled={!server||!token} onClick={push}>Back up</button><button className="button" disabled={!server||!token} onClick={pull}>Restore</button></div></article><article><header><Download/><div><h3>Portable backup</h3><p>Keep a complete copy that you control.</p></div></header><button className="button" onClick={download}><Download/> Export JSON</button></article><article><header><CircleHelp/><div><h3>About MindNotes</h3><p>Local-first connected notes, sources, and visual thinking.</p></div></header><small>Version 0.1.0 · No analytics · No account required</small></article></div>{message&&<div className="toast">{message}</div>}</section>
}

function Empty({icon,title,text,action,onAction}:{icon:React.ReactNode;title:string;text:string;action?:string;onAction?:()=>void}) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action&&<button className="button primary" onClick={onAction}><Plus/>{action}</button>}</div> }
function toggle(values:string[],value:string){return values.includes(value)?values.filter((item)=>item!==value):[...values,value]}
function snippet(text:string,q:string){const at=text.toLowerCase().indexOf(q);return text.slice(Math.max(0,at-45),Math.max(100,at+100)).replace(/\s+/g,' ')}
function addFolder(update:(fn:(w:Workspace)=>Workspace)=>void){const name=prompt('Folder name');if(!name?.trim())return;const folder:FolderType={id:uid(),name:name.trim(),parentId:null,color:colors[Math.floor(Math.random()*colors.length)],createdAt:now()};update((old)=>({...old,folders:[...old.folders,folder]}))}
