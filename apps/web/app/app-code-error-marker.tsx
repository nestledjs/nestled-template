import { Component, type ReactNode } from 'react'

// Errors thrown by the app's own code (a route's render or effect, or a route's own query) and
// passed on to the next error boundary up. The root ErrorBoundary reads this (`isAppCodeError`) so
// that such an error is shown as an error, never taken for a rejected session.
const appCodeErrors = new WeakSet<object>()

/** Records `error` as thrown by the app's own code (see `isAppCodeError`). */
export function markAppCodeError(error: unknown): void {
  if (typeof error === 'object' && error !== null) appCodeErrors.add(error)
}

/**
 * Whether the error was thrown by the app's own code, below an `AppCodeErrorMarker` (or passed on
 * by the Me boundary), rather than by the Me/session query. Such an error says nothing about the
 * session, whatever it carries: only a failure of the session query itself, or a loader's, may
 * decide a logout.
 */
export function isAppCodeError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && appCodeErrors.has(error)
}

type AppCodeErrorMarkerState = { caught?: { error: unknown } }

/**
 * Marks every error thrown below it as the app's own (`isAppCodeError`) and passes it on, unchanged,
 * to the next error boundary up. It renders nothing of its own and keeps nothing: the boundary
 * above decides what to show, with the session untouched.
 *
 * Wrap the routes' outlet with it, below whatever resolves the session:
 * - an app with a Me boundary puts it inside the boundary, around the routes (the template does),
 *   so a failure of the Me read itself is not marked and stays a session matter;
 * - an app that resolves Me in its root loader wraps its root `<Outlet />` with it, so a render
 *   error under its routes never reaches the root ErrorBoundary looking like a rejected session.
 *
 * A route's own error boundary below it still catches first; loader errors never pass through it.
 */
export class AppCodeErrorMarker extends Component<
  { children?: ReactNode },
  AppCodeErrorMarkerState
> {
  state: AppCodeErrorMarkerState = {}

  static getDerivedStateFromError(error: unknown): AppCodeErrorMarkerState {
    markAppCodeError(error)
    return { caught: { error } }
  }

  render() {
    if (this.state.caught) throw this.state.caught.error
    return this.props.children
  }
}
