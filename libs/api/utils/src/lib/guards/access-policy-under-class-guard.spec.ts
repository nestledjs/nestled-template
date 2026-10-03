import { AUTH_LEVEL_KEY } from './auth-level.decorator'
import { ACCESS_POLICY_KEY } from './access-policy.types'
import {
  RequirePlatformPermission,
  RequirePlatformPermissionUnderClassGuard,
} from './access-policy.decorator'

const metadataOf = (decorate: MethodDecorator, key: string): unknown => {
  class Probe {
    handler() {
      return null
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, 'handler')
  decorate(Probe.prototype, 'handler', descriptor as PropertyDescriptor)
  return Reflect.getMetadata(key, descriptor?.value as object)
}

describe('RequirePlatformPermissionUnderClassGuard', () => {
  it('declares the same policy as the composing variant', () => {
    const policy = metadataOf(
      RequirePlatformPermissionUnderClassGuard('platform.data-browser.read') as MethodDecorator,
      ACCESS_POLICY_KEY,
    )
    expect(policy).toEqual({
      scope: 'platform',
      permissions: ['platform.data-browser.read'],
      match: 'any',
    })
  })

  it('does NOT set an auth level, so a class-level AdminOnly is not overridden', () => {
    // getAllAndOverride([handler, controller]) lets the handler win. The composing variant sets
    // 'authenticated' here, which makes a generated CRUD root declare a weaker level than the
    // class guard actually enforces.
    expect(
      metadataOf(
        RequirePlatformPermissionUnderClassGuard('platform.data-browser.read') as MethodDecorator,
        AUTH_LEVEL_KEY,
      ),
    ).toBeUndefined()
    expect(
      metadataOf(
        RequirePlatformPermission('platform.data-browser.read') as MethodDecorator,
        AUTH_LEVEL_KEY,
      ),
    ).toBe('authenticated')
  })
})
