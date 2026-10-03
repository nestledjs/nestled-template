import type { Config } from '@react-router/dev/config'

export default {
  ssr: true,
  // Disable lazy route discovery (Fog of War) to prevent __manifest 400 errors
  routeDiscovery: { mode: 'initial' },
} satisfies Config
