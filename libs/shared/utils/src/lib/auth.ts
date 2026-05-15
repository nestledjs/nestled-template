// Helper to decode JWT and check expiration
export function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return false
    const now = Math.floor(Date.now() / 1000)
    return payload.exp < now
  } catch {
    return true // treat malformed tokens as expired
  }
}
