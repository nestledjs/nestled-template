import {
  INHERITED_PARENT_AUTHORIZATION_KEY,
  InheritedParentAuthorization,
} from './inherited-parent-authorization.decorator'

describe('InheritedParentAuthorization', () => {
  it('marks a pure parent projection for static access-policy analysis', () => {
    class Target {
      @InheritedParentAuthorization()
      operation() {
        return true
      }
    }

    expect(
      Reflect.getMetadata(INHERITED_PARENT_AUTHORIZATION_KEY, Target.prototype.operation),
    ).toBe(true)
  })
})
