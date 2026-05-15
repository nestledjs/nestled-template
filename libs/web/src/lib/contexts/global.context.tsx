import * as React from 'react'
import { ReactNode } from 'react'

import { MeQuery, Organization, OrganizationMember } from '@nestled-template/shared/sdk'


interface GlobalProviderContextValue {
  user?: MeQuery['me'] | null
  organizations?: Organization[]
  activeOrganization?: Organization | null
  activeOrganizationMember?: OrganizationMember | null
}

const GlobalContext = React.createContext<GlobalProviderContextValue | undefined>(undefined)

export function useGlobalCtx() {
  const context = React.useContext(GlobalContext)
  if (!context) {
    throw new Error('useGlobalCtx must be used within a GlobalContextProvider')
  }
  return context
}

interface GlobalContextProviderProps {
  children: ReactNode
  user?: MeQuery['me'] | null
  organizations?: Organization[]
  activeOrganization?: Organization | null
  activeOrganizationMember?: OrganizationMember | null
}

export function GlobalContextProvider({
  children,
  user = null,
  organizations = [],
  activeOrganization = null,
  activeOrganizationMember = null,
}: Readonly<GlobalContextProviderProps>) {
  const value = React.useMemo(
    () => ({ user, organizations, activeOrganization, activeOrganizationMember }),
    [user, organizations, activeOrganization, activeOrganizationMember]
  )
  return <GlobalContext.Provider value={value}>{children}</GlobalContext.Provider>
}
