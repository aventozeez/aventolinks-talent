// Custom Next.js server with integrated WebSocket relay.
// Run with: node server.mjs
// Next.js runs on port 3000, WebSocket relay runs on port 3001.

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'

const dev     = false
const port    = parseInt(process.env.PORT || '3000', 10)
const wsPort  = parseInt(process.env.WS_PORT || '3001', 10)

const app    = next({ dev })
const handle = app.getRequestHandler()

// In-memory state store per channel
const channelState = new Map()  // channel -> latest payload JSON
const clients      = new Map()  // ws -> Set of subscribed channels

function broadcast(senderWs, channel, message) {
  const raw = JSON.stringify(message)
  for (const [ws, channels] of clients) {
    if (ws === senderWs) continue
    if (!channels.has(channel)) continue
    if (ws.readyState === 1) ws.send(raw)
  }
}

app.prepare().then(() => {
  // Next.js HTTP server
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 Ready on http://0.0.0.0:${port}`)
  })

  // Separate WebSocket server on port 3001
  const wss = new WebSocketServer({ port: wsPort })

  wss.on('connection', (ws) => {
    clients.set(ws, new Set())

    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data) } catch { return }

      const { type, channel, payload } = msg

      if (type === 'subscribe') {
        clients.get(ws)?.add(channel)
        if (channelState.has(channel)) {
          ws.send(channelState.get(channel))
        }
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
    console.log(`🔌 WebSocket relay active on ws://0.0.0.0:${wsPort}\n`)
  })
})
