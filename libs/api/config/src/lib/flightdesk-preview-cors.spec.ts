import { isFlightDeskPreviewOrigin } from './flightdesk-preview-cors'

describe('isFlightDeskPreviewOrigin', () => {
  it.each([
    ['a single preview label', 'https://abc.preview.flightdesk.dev'],
    ['hyphens and digits in the label', 'https://task-123.preview.flightdesk.dev'],
    ['nested labels', 'https://a.b.preview.flightdesk.dev'],
    ['an uppercase host (browsers may send one)', 'https://ABC.Preview.FlightDesk.DEV'],
  ])('accepts %s', (_label, origin) => {
    expect(isFlightDeskPreviewOrigin(origin)).toBe(true)
  })

  // The grant is credentialed, so every one of these is a session-riding vector if it slips through.
  it.each([
    ['the bare preview host, which is not a per-task preview', 'https://preview.flightdesk.dev'],
    ['the apex domain', 'https://flightdesk.dev'],
    ['a non-preview FlightDesk host', 'https://app.flightdesk.dev'],
    ['plain http', 'http://abc.preview.flightdesk.dev'],
    ['a port', 'https://abc.preview.flightdesk.dev:8080'],
    ['a suffix attack', 'https://abc.preview.flightdesk.dev.evil.com'],
    ['the domain embedded in a path', 'https://evil.com/https://abc.preview.flightdesk.dev'],
    ['a look-alike with a hyphen for the dot', 'https://abc.preview-flightdesk.dev'],
    ['a look-alike with no dot at all', 'https://abcpreview.flightdesk.dev'],
    ['an underscore, which no browser emits in an Origin host', 'https://a_b.preview.flightdesk.dev'],
    ['a userinfo prefix', 'https://evil.com@abc.preview.flightdesk.dev.evil.com'],
    ['an empty label', 'https://.preview.flightdesk.dev'],
  ])('rejects %s', (_label, origin) => {
    expect(isFlightDeskPreviewOrigin(origin)).toBe(false)
  })

  it('rejects a missing origin rather than treating it as a match', () => {
    expect(isFlightDeskPreviewOrigin(undefined)).toBe(false)
    expect(isFlightDeskPreviewOrigin('')).toBe(false)
  })
})
