import { Outlet } from 'react-router'

export default function MembersLayout() {
  // Members layout is now just a passthrough since AuthProvider
  // and header are in the parent _authenticated layout
  return <Outlet />
}
