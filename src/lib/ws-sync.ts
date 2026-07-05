// Dual-transport sync — broadcasts on BOTH:
//   1. Local WebSocket relay (ws://<same-host>:3001) — instant on LAN
//   2. Supabase Realtime broadcast channel — works on the public URL where
//      no Node server exists
// Subscribers receive from whichever path delivers first; duplicates are
// silently dropped via a per-listener sequence number.
//
// Components don't need to know — they just call wsSubscribe/wsBroadcast.
//
// Falls back gracefully if WebSocket is unavailable (SSR/build time) or the
// Supabase client fails to init.

import { supabase } from './supabase'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBChannel = any

type Listener = (payload: unknown) => void

// ── Local WebSocket transport ─────────────────────────────────────────────────
let ws: WebSocket | null = null
let wsReady = false
const wsQueue: string[] = []
const listeners = new Map<string, Set<Listener>>()

// Track last payload signature per channel per listener to dedupe cross-transport.
const lastSig = new WeakMap<Listener, Map<string, string>>()

// ── Supabase Realtime transport ───────────────────────────────────────────────
// Each channel tracks its own subscribe state + a pending-send queue that
// flushes the moment the channel actually reaches SUBSCRIBED. Without this
// queue, any broadcast issued in the ~1-2s after wsBroadcast() first touches
// a channel is silently dropped by Supabase (the client's send() no-ops until
// the WebSocket handshake completes).
type SbEntry = {
  channel: SBChannel
  ready: boolean
  pending: unknown[]
}
const sbChannels = new Map<string, SbEntry>()

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

function ensureSbChannel(channel: string): SbEntry | null {
  if (typeof window === 'undefined') return null
  const existing = sbChannels.get(channel)
  if (existing) return existing
  try {
    // Supabase channel names must be alphanumeric-ish; replace any punctuation
    const sbName = 'sync_' + channel.replace(/[^a-zA-Z0-9_-]/g, '_')
    console.log('[ws-sync] creating Supabase channel', sbName, 'for logical channel', channel)
    const ch = supabase.channel(sbName, { config: { broadcast: { self: false } } })
    const entry: SbEntry = { channel: ch, ready: false, pending: [] }
    ch.on('broadcast', { event: 'msg' }, (msg: { payload?: unknown }) => {
      console.log('[ws-sync] received Supabase broadcast on', sbName, msg)
      dispatch(channel, msg?.payload)
    })
    ch.subscribe((status: string) => {
      console.log('[ws-sync] Supabase channel', sbName, 'status ->', status)
      if (status === 'SUBSCRIBED') {
        entry.ready = true
        for (const p of entry.pending) {
          try { ch.send({ type: 'broadcast', event: 'msg', payload: p }) } catch { /* noop */ }
        }
        entry.pending.length = 0
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        entry.ready = false
      }
    })
    sbChannels.set(channel, entry)
    return entry
  } catch (e) { console.error('[ws-sync] ensureSbChannel failed', e); return null }
}

export function wsSubscribe(channel: string, cb: Listener): () => void {
  ensureWsConnected()
  ensureSbChannel(channel)

  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(cb)

  const msg = JSON.stringify({ type: 'subscribe', channel })
  if (wsReady && ws) ws.send(msg)
  else wsQueue.push(msg)

  return () => {
    const subs = listeners.get(channel)
    subs?.delete(cb)
    lastSig.get(cb)?.delete(channel)
    if (subs && subs.size === 0) {
      const entry = sbChannels.get(channel)
      if (entry) { try { supabase.removeChannel(entry.channel) } catch { /* noop */ } sbChannels.delete(channel) }
    }
  }
}

export function wsBroadcast(channel: string, payload: unknown) {
  ensureWsConnected()
  const entry = ensureSbChannel(channel)

  // Local WS — instant on LAN
  const msg = JSON.stringify({ type: 'broadcast', channel, payload })
  if (wsReady && ws) ws.send(msg)
  else wsQueue.push(msg)

  // Supabase Realtime — send now if subscribed, otherwise queue until it is
  if (entry) {
    if (entry.ready) {
      try { entry.channel.send({ type: 'broadcast', event: 'msg', payload }) } catch { /* noop */ }
    } else {
      entry.pending.push(payload)
    }
  }
}
