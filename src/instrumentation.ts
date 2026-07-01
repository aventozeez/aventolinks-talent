export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { createWsRelay } = await import('./lib/ws-relay')
    createWsRelay()
  }
}
