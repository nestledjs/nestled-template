export const DEFAULT_SESSION_COOKIE_NAME = '__session'

/**
 * The session cookie's name, for everything in the API that sets, clears or reads it. The web build
 * inlines the same variable, so it is the one name both sides have. `API_COOKIE_NAME` is not read:
 * the API refuses to start when it names another cookie (validation.ts).
 */
export function sessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env['VITE_COOKIE_NAME'] || DEFAULT_SESSION_COOKIE_NAME
}
