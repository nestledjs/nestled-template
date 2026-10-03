import { Outlet } from 'react-router'

export function Component() {
  console.log('🔥 [GLOBAL LAYOUT] Component called')

  // This layout is now just a passthrough since GlobalContextProvider is in root.tsx
  return <Outlet />
}
