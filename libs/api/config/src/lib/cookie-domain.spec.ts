import { configuration } from './configuration'
import { cookieDomainFromSetting } from './cookie-domain'

// The rule the API sets its session cookie's `Domain` with. apps/web/tests/session-cookie.spec.ts
// runs the same table against the web server's copy (`cookieDomainFromSetting` in
// apps/web/app/session/session-cookie.ts); keep the two tables identical.
const SETTING_CASES: ReadonlyArray<[string | undefined, string | undefined]> = [
  [undefined, undefined],
  ['', undefined],
  ['   ', undefined],
  ['localhost', undefined],
  [' localhost ', undefined],
  ['127.0.0.1', undefined],
  ['[::1]', undefined],
  ['127.example.com', '127.example.com'],
  ['.127.example.com', '.127.example.com'],
  ['example.com', 'example.com'],
  ['.example.com', '.example.com'],
  ['app.example.com', 'app.example.com'],
  [' .example.com ', '.example.com'],
  ['.example.com,.example.org', '.example.com'],
  ['.example.com, .example.org', '.example.com'],
  [' , .example.com', '.example.com'],
  ['localhost,.example.com', undefined],
]

describe('cookieDomainFromSetting', () => {
  it.each(SETTING_CASES)('API_COOKIE_DOMAIN=%j sets Domain %j', (value, expected) => {
    expect(cookieDomainFromSetting(value)).toBe(expected)
  })
})

describe('configuration() session cookie domain', () => {
  const original = process.env['API_COOKIE_DOMAIN']

  afterEach(() => {
    if (original === undefined) delete process.env['API_COOKIE_DOMAIN']
    else process.env['API_COOKIE_DOMAIN'] = original
  })

  it('sets the first entry of a comma-separated list', () => {
    process.env['API_COOKIE_DOMAIN'] = '.example.com,.example.org'

    expect(configuration().api.cookie.options).toMatchObject({ domain: '.example.com' })
  })

  it('keeps the domain of a host that only starts with 127.', () => {
    process.env['API_COOKIE_DOMAIN'] = '127.example.com'

    expect(configuration().api.cookie.options).toMatchObject({ domain: '127.example.com' })
  })

  it.each(['', 'localhost', '127.0.0.1', '[::1]'])('sets no domain for %j', value => {
    process.env['API_COOKIE_DOMAIN'] = value

    expect(configuration().api.cookie.options).not.toHaveProperty('domain')
  })
})
