/**
 * crypto.randomUUID() only works in secure contexts (HTTPS or localhost).
 * On a LAN with a plain http://<lan-ip>:3000 URL, Chrome hides it and calls
 * throw at runtime. Fall back to a math-based generator so LAN hosting
 * works without HTTPS.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  // RFC-4122 v4-ish. Not cryptographically strong; fine for local IDs.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
