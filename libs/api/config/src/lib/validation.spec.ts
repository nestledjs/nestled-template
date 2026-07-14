import { validationSchema } from './validation'

/**
 * These specs pin the two config defaults whose failure modes are only visible at STARTUP, where a
 * bad value either crashes with an unhelpful message or silently produces a `:undefined` URL.
 */
describe('validationSchema', () => {
  const ENV = process.env

  beforeEach(() => {
    process.env = { ...ENV }
    // A Joi `.default()` is evaluated against process.env at schema-build time, so these specs
    // assert the *shape* of the default rather than mutating env after import.
  })

  afterEach(() => {
    process.env = ENV
  })

  describe('API_URL', () => {
    const validate = (API_URL: string) => validationSchema.validate({ API_URL }, { allowUnknown: true })

    it('reports a concrete, diagnosable message instead of the generic any.invalid text', () => {
      // Regression (PIR-203): this previously raised `any.invalid`, rendering only
      // `"API_URL" contains an invalid value` — undiagnosable from a startup crash.
      const { error } = validate('ftp://api.example.com')
      expect(error).toBeDefined()
      expect(error?.details[0].type).toBe('string.apiOrigin')

      const message = error?.message ?? ''
      expect(message).not.toContain('contains an invalid value')
      // Interpolation must actually resolve — a broken template would leave the raw tokens behind.
      expect(message).toContain('"API_URL"')
      expect(message).toContain('"ftp://api.example.com"')
      expect(message).not.toContain('#label')
      expect(message).not.toContain('#value')
      // The message must state the expected shape and the `/api` trap.
      expect(message).toContain('origin')
      expect(message).toContain('/api')
    })

    it('self-heals a misconfigured origin rather than rejecting it', () => {
      expect(validate('https://api.example.com/api/').value.API_URL).toBe('https://api.example.com')
      expect(validate('  https://api.example.com  ').value.API_URL).toBe('https://api.example.com')
    })

    it('accepts a clean origin unchanged', () => {
      expect(validate('https://api.example.com').value.API_URL).toBe('https://api.example.com')
      expect(validate('http://localhost:3000').value.API_URL).toBe('http://localhost:3000')
    })
  })

  describe('defaults', () => {
    it('never renders a :undefined port', () => {
      // Regression (PIR-202): WEB_URL interpolated process.env['WEB_PORT'] directly and could not
      // see `WEB_PORT: Joi.number().default(4200)`, so an unset WEB_PORT yielded
      // `http://localhost:undefined`.
      const { value } = validationSchema.validate({}, { allowUnknown: true })
      expect(value.WEB_URL).not.toContain('undefined')
      expect(value.API_URL).not.toContain('undefined')
    })
  })
})
