import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AUTH_LEVEL_KEY, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import { StaffEmailResolver } from './email.resolver'

describe('StaffEmailResolver authorization', () => {
  it('protects every operation through class-level admin metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StaffEmailResolver) as unknown[]

    expect(guards).toContain(GqlAuthAdminGuard)
    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, StaffEmailResolver)).toBe('admin')
  })
})
