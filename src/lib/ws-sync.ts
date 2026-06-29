// Local WebSocket sync — replaces Supabase realtime for local network hosting.
// The browser connects to ws://<same-host>:<same-port> automatically.
// Falls back gracefully if WebSocket is unavailable (SSR, build time).

type Listener = (payload: unknown) => void

let ws: WebSocket | null = null
let wsReady = false
const queue: string[] = []
const listeners = new Map<string, Set<Listener>>()

function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${hostname}:3001`
}

function ensureConnected() {
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  ws = new WebSocket(getWsUrl())
  wsReady = false

  ws.onopen = () => {
    wsReady = true
    // Re-subscribe to all channels
    for (const channel of listeners.keys()) {
      ws!.send(JSON.stringify({ type: 'subscribe', channel }))
    }
    // Flush queued broadcasts
    for (const msg of queue) ws!.send(msg)
    queue.length = 0
  }

  ws.onmessage = (evt) => {
    let msg: { type: string; channel: string; payload: unknown }
    try { msg = JSON.parse(evt.data) } catch { return }
    if (msg.type !== 'update') return
    const subs = listeners.get(msg.channel)
    if (subs) subs.forEach(fn => fn(msg.payload))
  }

  ws.onclose = () => {
    wsReady = false
    // Reconnect after 1s
    setTimeout(ensureConnected, 1000)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

export function wsSubscribe(channel: string, cb: Listener): () => void {
  ensureConnected()

  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(cb)

  // Subscribe on the server (or queue until open)
  const msg = JSON.stringify({ type: 'subscribe', channel })
  if (wsReady && ws) ws.send(msg)
  else queue.push(msg)

  return () => {
    listeners.get(channel)?.delete(cb)
  }
}

export function wsBroadcast(channel: string, payload: unknown) {
  ensureConnected()
  const msg = JSON.stringify({ type: 'broadcast', channel, payload })
  if (wsReady && ws) ws.send(msg)
  else queue.push(msg)
}
