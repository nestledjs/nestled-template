import { AdminOnly, Authenticated, AUTH_LEVEL_KEY, Public } from './auth-level.decorator'

// The decorators and GlobalAuthGuard agree only by sharing this key and these values. A rename on
// one side alone would leave every operation reading as undeclared, so pin both here.
const levelWrittenBy = (decorator: () => MethodDecorator | ClassDecorator): unknown => {
  class Target {
    operation() {
      return null
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'operation')
  ;(decorator() as MethodDecorator)(Target.prototype, 'operation', descriptor!)

  return Reflect.getMetadata(AUTH_LEVEL_KEY, Target.prototype.operation)
}

describe('auth level decorators', () => {
  it('uses a namespaced metadata key', () => {
    expect(AUTH_LEVEL_KEY).toBe('nestled:authLevel')
  })

  it('records the level each decorator stands for', () => {
    expect(levelWrittenBy(Public)).toBe('public')
    expect(levelWrittenBy(Authenticated)).toBe('authenticated')
    expect(levelWrittenBy(AdminOnly)).toBe('admin')
  })

  it('writes nothing when no decorator is applied', () => {
    class Undeclared {
      operation() {
        return null
      }
    }

    // This is the case GlobalAuthGuard refuses, so it must genuinely produce no metadata.
    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, Undeclared.prototype.operation)).toBeUndefined()
  })

  it('applies at class level as well as method level', () => {
    @(Public() as ClassDecorator)
    class PublicController {}

    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, PublicController)).toBe('public')
  })
})
