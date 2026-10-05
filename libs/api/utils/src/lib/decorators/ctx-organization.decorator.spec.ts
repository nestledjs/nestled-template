import { ExecutionContext } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { GqlExecutionContext } from '@nestjs/graphql'
import { CtxOptionalOrganizationId } from './ctx-organization.decorator'

function factoryOf(decorator: () => ParameterDecorator) {
  class Target {
    handler(@decorator() _value: unknown) {
      return _value
    }
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler')
  return metadata[Object.keys(metadata)[0]].factory as (
    data: unknown,
    ctx: ExecutionContext,
  ) => unknown
}

describe('CtxOptionalOrganizationId', () => {
  const read = (req: object) => {
    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({ getContext: () => ({ req }) } as never)
    return factoryOf(CtxOptionalOrganizationId)(undefined, {} as ExecutionContext)
  }

  afterEach(() => jest.restoreAllMocks())

  it("gives the membership-checked context's organization", () => {
    expect(read({ organizationContext: { organizationId: 'org-1' } })).toBe('org-1')
  })

  it('gives null, not the raw active organization, when no context was attached', () => {
    expect(read({ user: { activeOrganizationId: 'org-left' } })).toBeNull()
  })
})
