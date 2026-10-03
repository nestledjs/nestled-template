import { useEffect, useRef, useState } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const turnstileSiteKey = (): string | undefined => {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  return key?.trim() ? key.trim() : undefined
}

/** Resolves once the Turnstile script has loaded, injecting it on first use. */
const loadTurnstileScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.turnstile) return resolve()

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')))
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')))
    document.head.appendChild(script)
  })

interface TurnstileWidgetProps {
  /** Called with a fresh token on solve, and with undefined when it expires or errors. */
  onToken: (token: string | undefined) => void
  theme?: 'light' | 'dark' | 'auto'
}

/**
 * Cloudflare Turnstile challenge.
 *
 * Renders nothing when VITE_TURNSTILE_SITE_KEY is unset, mirroring the API: with no secret key
 * configured the server does not ask for a token, so the widget would be dead weight.
 */
export function TurnstileWidget({ onToken, theme = 'auto' }: Readonly<TurnstileWidgetProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const siteKey = turnstileSiteKey()

  // onToken is intentionally excluded from the dep array: callers pass an inline closure, so
  // including it would re-render the widget on every keystroke and reset the challenge. The ref
  // keeps the latest callback reachable without re-running the effect.
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!siteKey) return

    let widgetId: string | undefined
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: token => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(undefined),
          'error-callback': () => onTokenRef.current(undefined),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey, theme])

  if (!siteKey) return null

  if (failed) {
    return (
      <p className="text-center text-sm text-rose-300">
        The verification challenge could not be loaded. Please disable any content blockers and
        reload the page.
      </p>
    )
  }

  return <div ref={containerRef} className="flex justify-center" />
}
