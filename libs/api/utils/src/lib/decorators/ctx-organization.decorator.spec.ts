import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { GqlExecutionContext } from '@nestjs/graphql'
import {
  CtxOptionalOrganizationId,
  CtxOrganization,
  CtxOrganizationId,
} from './ctx-organization.decorator'

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

// A GraphQL context with no request (a subscription connection, a decorator used outside GraphQL)
// is a server bug. It must be a 500: a 401 would log the user out, and a 403
// ORGANIZATION_CONTEXT_REQUIRED would send them to the organization picker for nothing.
describe('organization decorators without a request', () => {
  const readWithContext = (decorator: () => ParameterDecorator, context: object | undefined) => {
    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({ getContext: () => context } as never)
    return () => factoryOf(decorator)(undefined, {} as ExecutionContext)
  }

  const thrownBy = (read: () => unknown): unknown => {
    let thrown: unknown
    try {
      read()
    } catch (error) {
      thrown = error
    }
    return thrown
  }

  afterEach(() => jest.restoreAllMocks())

  it.each([
    ['CtxOrganization', CtxOrganization],
    ['CtxOrganizationId', CtxOrganizationId],
    ['CtxOptionalOrganizationId', CtxOptionalOrganizationId],
  ])('%s answers a context with no req with a 500', (_name, decorator) => {
    for (const context of [{}, { req: undefined }, undefined]) {
      const thrown = thrownBy(readWithContext(decorator, context))
      expect(thrown).toBeInstanceOf(InternalServerErrorException)
      expect(thrown).not.toBeInstanceOf(UnauthorizedException)
      expect(thrown).not.toBeInstanceOf(ForbiddenException)
    }
  })

  it('still answers a request with no organization context with the 403', () => {
    expect(readWithContext(CtxOrganizationId, { req: {} })).toThrow(ForbiddenException)
    expect(readWithContext(CtxOrganization, { req: {} })).toThrow(ForbiddenException)
  })
})
