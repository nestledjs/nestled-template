import { RouterContextProvider } from 'react-router'
import { sessionContext, type AppSessionVerdict, type SessionUser } from '../../app/session'

/**
 * A router context as the session middleware leaves it, for calling a loader or action directly
 * in a spec: `loader({ request, params: {}, context: withSession(SIGNED_IN) })`.
 */
export function withSession(verdict: AppSessionVerdict): RouterContextProvider {
  const context = new RouterContextProvider()
  context.set(sessionContext, verdict)
  return context
}

/** A user with every field of the app's Me document, as the session middleware puts it in the verdict. */
export const TEST_USER: SessionUser = {
  __typename: 'User',
  id: 'user-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: null,
  bio: null,
  isSuperAdmin: false,
  emailValidated: true,
  twoFactorEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isEmulating: false,
  originalAdminId: null,
  activeOrganizationId: null,
  emails: [],
  phoneNumbers: [],
  avatar: null,
  images: [],
}

export const SIGNED_IN: AppSessionVerdict = { kind: 'signed-in', user: TEST_USER }
export const REJECTED: AppSessionVerdict = { kind: 'signed-out', reason: 'rejected' }
export const NO_SESSION: AppSessionVerdict = { kind: 'signed-out', reason: 'no-session' }
export const UNKNOWN: AppSessionVerdict = { kind: 'unknown', reason: 'outage' }
