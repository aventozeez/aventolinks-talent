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
const sbChannels = new Map<string, SBChannel>()

function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${hostname}:3001`
}

function dispatch(channel: string, payload: unknown) {
  const subs = listeners.get(channel)
  if (!subs) return
  // Cheap sig for dedupe — string form of the payload
  const sig = (() => { try { return JSON.stringify(payload) } catch { return '' } })()
  subs.forEach(fn => {
    const map = lastSig.get(fn) ?? new Map<string, string>()
    if (map.get(channel) === sig) return
    map.set(channel, sig)
    lastSig.set(fn, map)
    try { fn(payload) } catch { /* swallow — one listener error shouldn't kill others */ }
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

function ensureSbChannel(channel: string) {
  if (typeof window === 'undefined') return
  if (sbChannels.has(channel)) return
  try {
    // Sanitize channel name: Supabase channel names can't contain ':' for realtime
    const sbName = 'sync_' + channel.replace(/[^a-zA-Z0-9_-]/g, '_')
    const ch = supabase.channel(sbName, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'msg' }, (msg: { payload?: unknown }) => {
      dispatch(channel, msg?.payload)
    })
    ch.subscribe()
    sbChannels.set(channel, ch)
  } catch { /* Supabase unavailable — fall back to WS only */ }
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
    // If no subscribers left on this channel, tear down its Supabase channel too
    if (subs && subs.size === 0) {
      const sbCh = sbChannels.get(channel)
      if (sbCh) { try { supabase.removeChannel(sbCh) } catch { /* noop */ } sbChannels.delete(channel) }
    }
  }
}

export function wsBroadcast(channel: string, payload: unknown) {
  ensureWsConnected()
  ensureSbChannel(channel)

  // Local WS — instant on LAN
  const msg = JSON.stringify({ type: 'broadcast', channel, payload })
  if (wsReady && ws) ws.send(msg)
  else wsQueue.push(msg)

  // Supabase Realtime — works on the public URL
  const sbCh = sbChannels.get(channel)
  if (sbCh) {
    try { sbCh.send({ type: 'broadcast', event: 'msg', payload }) } catch { /* swallow */ }
  }
}
