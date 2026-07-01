import { WebSocketServer } from 'ws'

export function createWsRelay() {
  const wsPort = parseInt(process.env.WS_PORT || '3001', 10)
  const channelState = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = new Map<any, Set<string>>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function broadcast(senderWs: any, channel: string, message: object) {
    const raw = JSON.stringify(message)
    for (const [ws, channels] of clients) {
      if (ws === senderWs) continue
      if (!channels.has(channel)) continue
      if (ws.readyState === 1) ws.send(raw)
    }
  }

  const wss = new WebSocketServer({ port: wsPort })

  wss.on('connection', (ws) => {
    clients.set(ws, new Set())
    ws.on('message', (data: Buffer) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let msg: any
      try { msg = JSON.parse(data.toString()) } catch { return }
      const { type, channel, payload } = msg
      if (type === 'subscribe') {
        clients.get(ws)?.add(channel)
        if (channelState.has(channel)) ws.send(channelState.get(channel)!)
      }
      if (type === 'broadcast') {
        const outMsg = { type: 'update', channel, payload }
        channelState.set(channel, JSON.stringify(outMsg))
        broadcast(ws, channel, outMsg)
      }
    })
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })

  wss.on('listening', () => {
    console.log(`🔌 WS relay active on ws://localhost:${wsPort}`)
  })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`WS relay: port ${wsPort} already in use — skipping`)
    } else {
      console.error('WS relay error:', err.message)
    }
  })
}
