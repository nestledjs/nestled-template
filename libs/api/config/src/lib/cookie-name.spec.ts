import { ConfigModule } from '@nestjs/config'
import { configuration } from './configuration'
import { sessionCookieName } from './cookie-name'
import { validationSchema } from './validation'

const KEYS = ['VITE_COOKIE_NAME', 'API_COOKIE_NAME']

describe('the session cookie name', () => {
  const saved = KEYS.map(key => process.env[key])

  beforeEach(() => KEYS.forEach(key => delete process.env[key]))
  afterAll(() =>
    KEYS.forEach((key, index) => {
      const value = saved[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }),
  )

  const validate = (env: Record<string, string>) =>
    validationSchema.validate(env, { allowUnknown: true })

  describe('settings that keep working as they did', () => {
    it.each([
      ['neither', {}, '__session'],
      ['only VITE_COOKIE_NAME', { VITE_COOKIE_NAME: 'app' }, 'app'],
      ['both, equal', { VITE_COOKIE_NAME: 'app', API_COOKIE_NAME: 'app' }, 'app'],
      ['API_COOKIE_NAME with the default name', { API_COOKIE_NAME: '__session' }, '__session'],
      ['an empty API_COOKIE_NAME', { VITE_COOKIE_NAME: 'app', API_COOKIE_NAME: '' }, 'app'],
    ])('%s', (_case, env: Record<string, string>, expected) => {
      expect(validate(env).error).toBeUndefined()
      Object.assign(process.env, env)
      expect(sessionCookieName()).toBe(expected)
      // The name the API sets its cookie under.
      expect(configuration().api.cookie.name).toBe(expected)
    })
  })

  describe('settings the API refuses to start with', () => {
    const refused: [string, Record<string, string>][] = [
      ['only API_COOKIE_NAME', { API_COOKIE_NAME: 'api' }],
      ['two different names', { VITE_COOKIE_NAME: 'app', API_COOKIE_NAME: 'api' }],
    ]

    it.each(refused)('%s', (_case, env) => {
      const { error } = validate(env)
      expect(error?.message).toContain('API_COOKIE_NAME')
      expect(error?.message).toContain('VITE_COOKIE_NAME')
      expect(error?.message).not.toContain('{{')
    })

    it.each(refused)('%s, at boot', async (_case, env) => {
      Object.assign(process.env, env)
      await expect(
        ConfigModule.forRoot({ ignoreEnvFile: true, validationSchema, load: [configuration] }),
      ).rejects.toThrow(/API_COOKIE_NAME/)
    })
  })
})
