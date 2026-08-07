import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AUTH_LEVEL_KEY, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import { AdminEmailResolver } from './admin-email.resolver'

describe('AdminEmailResolver authorization', () => {
  it('protects every operation through class-level admin metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminEmailResolver) as unknown[]

    expect(guards).toContain(GqlAuthAdminGuard)
    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, AdminEmailResolver)).toBe('admin')
  })
})
