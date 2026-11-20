import type { Config } from '@react-router/dev/config'

export default {
  ssr: true,
  // Disable lazy route discovery (Fog of War) to prevent __manifest 400 errors
  routeDiscovery: { mode: 'initial' },
  // Route middleware and the typed router context (stable since React Router 7.9; the default in
  // v8). The session is judged once per request in the root route's middleware
  // (app/session/session-middleware.server.ts), and loaders read it from `context`.
  future: { v8_middleware: true },
} satisfies Config
