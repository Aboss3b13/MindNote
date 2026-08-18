import type { Workspace } from './types'
import { Capacitor } from '@capacitor/core'

const API = Capacitor.isNativePlatform() ? 'https://abbas.ali-raza.net/Mindnotes/api' : './api'
const encoder = new TextEncoder(), decoder = new TextDecoder()
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const TOKEN = 'mindnotes-session-v1', KEY = 'mindnotes-device-key-v1', EMAIL = 'mindnotes-account-email-v1'

export interface AccountState { email: string; signedIn: boolean }
async function request(path: string, options: RequestInit = {}, authenticated = true) {
  const headers = new Headers(options.headers)
  const token = localStorage.getItem(TOKEN)
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API}/${path}`, { ...options, headers })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The MindNotes server could not complete this request.')
  return result
}
async function deriveKey(email: string, password: string) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = await crypto.subtle.digest('SHA-256', encoder.encode(`mindnotes-encryption:${email.toLowerCase()}`))
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, 256)
  const raw = new Uint8Array(bits); localStorage.setItem(KEY, bytesToBase64(raw))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function storedKey() {
  const raw = localStorage.getItem(KEY); if (!raw) throw new Error('Sign in again to unlock your encrypted notes.')
  return crypto.subtle.importKey('raw', base64ToBytes(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(workspace: Workspace) {
  const key = await storedKey(), iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(workspace)))
  return { format: 'mindnotes-encrypted-v1', iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) }
}
async function decrypt(record: { iv: string; data: string }): Promise<Workspace> {
  const key = await storedKey(), value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) }, key, base64ToBytes(record.data))
  return JSON.parse(decoder.decode(value))
}
export async function connect(email: string, password: string, register: boolean) {
  const normalized = email.trim().toLowerCase(); await deriveKey(normalized, password)
  try {
    const result = await request(`account.php?action=${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalized, password }) }, false)
    localStorage.setItem(TOKEN, result.token); localStorage.setItem(EMAIL, result.user.email); return result.user
  } catch (error) { localStorage.removeItem(KEY); throw error }
}
export async function restoreAccount(): Promise<AccountState> {
  if (!localStorage.getItem(TOKEN) || !localStorage.getItem(KEY)) return { email: '', signedIn: false }
  try { const result = await request('account.php?action=me'); return { email: result.user.email, signedIn: true } }
  catch { clearAccount(); return { email: '', signedIn: false } }
}
export function accountEmail() { return localStorage.getItem(EMAIL) || '' }
export function signedIn() { return Boolean(localStorage.getItem(TOKEN) && localStorage.getItem(KEY)) }
export function clearAccount() { localStorage.removeItem(TOKEN); localStorage.removeItem(KEY); localStorage.removeItem(EMAIL) }
export async function logout() { await request('account.php?action=logout', { method: 'POST' }).catch(() => {}); clearAccount() }
export async function pushWorkspace(workspace: Workspace) { const body = await encrypt(workspace); await request('workspace.php', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
export async function pullWorkspace(): Promise<Workspace | null> { const result = await request('workspace.php'); return result.workspace ? decrypt(result.workspace) : null }

export function mergeWorkspaces(local: Workspace, remote: Workspace): Workspace {
  const merge = <T extends { id: string; updatedAt?: string; createdAt?: string }>(left: T[], right: T[]) => {
    const values = new Map(left.map((item) => [item.id, item]))
    right.forEach((item) => { const old = values.get(item.id); if (!old || Date.parse(item.updatedAt || item.createdAt || '') >= Date.parse(old.updatedAt || old.createdAt || '')) values.set(item.id, item) })
    return [...values.values()]
  }
  return { version: 1, notes: merge(local.notes, remote.notes), sources: merge(local.sources, remote.sources), folders: merge(local.folders, remote.folders), updatedAt: new Date().toISOString() }
}
