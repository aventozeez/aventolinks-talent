// Reliable sync transport — uses THREE paths, cascading from fastest to most
// robust so the app works both on a LAN (with the local dev server running the
// WS relay) and on a static host like Namecheap where nothing but HTTPS works.
//
//   1. Local WebSocket relay (ws://<same-host>:3001)
//      - Instant on LAN
//      - Silently unavailable on production
//   2. Supabase DB row in fsc_match_state (one row per logical channel)
//      - Every broadcast upserts { id, data, updated_at }
//      - Every subscriber polls the row every 1s
//      - Works on ANY host that can reach Supabase over HTTPS
//   3. Deduplication by JSON signature per listener so the same payload
//      arriving over multiple transports is only delivered once.
//
// Components call the same wsSubscribe / wsBroadcast API as before.

import { supabase } from './supabase'

type Listener = (payload: unknown) => void

// ── Local WebSocket transport ─────────────────────────────────────────────────
let ws: WebSocket | null = null
let wsReady = false
const wsQueue: string[] = []
const listeners = new Map<string, Set<Listener>>()

// Track last payload signature per channel per listener to dedupe cross-transport.
const lastSig = new WeakMap<Listener, Map<string, string>>()

// ── DB polling transport (Supabase fsc_match_state table) ─────────────────────
// Per-channel poller state — one setInterval regardless of how many listeners
// share the channel, cleaned up when the last listener unsubscribes.
type PollEntry = {
  interval: ReturnType<typeof setInterval>
  lastUpdatedAt: string | null
  refCount: number
}
const pollers = new Map<string, PollEntry>()

function channelToRowId(channel: string): string {
  // Row IDs in fsc_match_state are string keys; namespace to avoid clashing
  // with existing FSC rows like 'default' / 'bz_pending' / 'fsc_schools'.
  return 'sync:' + channel
}

function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${hostname}:3001`
}

function dispatch(channel: string, payload: unknown) {
  const subs = listeners.get(channel)
  if (!subs) return
  const sig = (() => { try { return JSON.stringify(payload) } catch { return '' } })()
  subs.forEach(fn => {
    const map = lastSig.get(fn) ?? new Map<string, string>()
    if (map.get(channel) === sig) return
    map.set(channel, sig)
    lastSig.set(fn, map)
    try { fn(payload) } catch { /* one listener error shouldn't kill others */ }
  })
}

// ── Local WebSocket relay (best-effort — always attempted, silent on failure) ─
function ensureWsConnected() {
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  try { ws = new WebSocket(getWsUrl()) } catch { ws = null; return }
  wsReady = false

  ws.onopen = () => {
    wsReady = true
    for (const channel of listeners.keys()) ws!.send(JSON.stringify({ type: 'subscribe', channel }))
    for (const msg of wsQueue) ws!.send(msg)
    wsQueue.length = 0
  }

  ws.onmessage = (evt) => {
    let msg: { type: string; channel: string; payload: unknown }
    try { msg = JSON.parse(evt.data) } catch { return }
    if (msg.type !== 'update') return
    dispatch(msg.channel, msg.payload)
  }

  ws.onclose = () => { wsReady = false; setTimeout(ensureWsConnected, 1500) }
  ws.onerror = () => { ws?.close() }
}

// ── DB polling: fetch the row, deliver its payload if updated_at changed ──────
async function pollOnce(channel: string, entry: PollEntry) {
  try {
    const rowId = channelToRowId(channel)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('fsc_match_state')
      .select('data, updated_at')
      .eq('id', rowId)
      .maybeSingle()
    if (!data) return
    if (entry.lastUpdatedAt === data.updated_at) return
    entry.lastUpdatedAt = data.updated_at
    dispatch(channel, data.data)
  } catch { /* ignore transient DB errors */ }
}

function ensurePoller(channel: string) {
  const existing = pollers.get(channel)
  if (existing) { existing.refCount++; return }
  const entry: PollEntry = {
    interval: setInterval(() => pollOnce(channel, entry), 1000),
    lastUpdatedAt: null,
    refCount: 1,
  }
  pollers.set(channel, entry)
  // Fetch immediately on first subscribe so slow openers see current state
  pollOnce(channel, entry)
}

function releasePoller(channel: string) {
  const entry = pollers.get(channel)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    clearInterval(entry.interval)
    pollers.delete(channel)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function wsSubscribe(channel: string, cb: Listener): () => void {
  ensureWsConnected()
  ensurePoller(channel)

  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(cb)

  const msg = JSON.stringify({ type: 'subscribe', channel })
  if (wsReady && ws) ws.send(msg)
  else wsQueue.push(msg)

  return () => {
    const subs = listeners.get(channel)
    subs?.delete(cb)
    lastSig.get(cb)?.delete(channel)
    releasePoller(channel)
  }
}

export function wsBroadcast(channel: string, payload: unknown) {
  ensureWsConnected()

  // Local WS — instant on LAN
  const msg = JSON.stringify({ type: 'broadcast', channel, payload })
  if (wsReady && ws) ws.send(msg)
  else wsQueue.push(msg)

  // DB write — durable, works on public URL
  ;(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('fsc_match_state').upsert(
        { id: channelToRowId(channel), data: payload, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
    } catch { /* silent — poller will pick up on next successful write */ }
  })()

  // Locally, dispatch immediately so the sender's own UI reflects the change
  // without waiting for the poller cycle.
  dispatch(channel, payload)
}
