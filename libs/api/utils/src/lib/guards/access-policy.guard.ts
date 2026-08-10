import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'
import { OrganizationContext } from '../types/nest-context-type'
import { OrganizationContextService } from '../services/organization-context.service'
import {
  ACCESS_CONTROL_SERVICE,
  ACCESS_POLICY_KEY,
  AccessPolicy,
  PlatformPermissionEvaluator,
} from './access-policy.types'

type RequestWithAccessContext = {
  user?: User
  organizationContext?: OrganizationContext
  __nestledPlatformPermissions?: Promise<readonly string[]>
}

function getRequest(context: ExecutionContext): RequestWithAccessContext {
  if (context.getType<string>() === 'http') {
    return context.switchToHttp().getRequest<RequestWithAccessContext>()
  }

  return GqlExecutionContext.create(context).getContext().req as RequestWithAccessContext
}

function getOperationValues(context: ExecutionContext): Record<string, unknown> {
  if (context.getType<string>() === 'http') {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, unknown>
      body?: Record<string, unknown>
      query?: Record<string, unknown>
    }>()
    return { ...request.query, ...request.params, ...request.body }
  }

  return GqlExecutionContext.create(context).getArgs<Record<string, unknown>>()
}

function valueAtPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

export function permissionGrantMatches(grant: string, required: string): boolean {
  if (grant === '*') return true
  if (grant === required) return true
  if (!grant.endsWith('.*')) return false

  const namespace = grant.slice(0, -1)
  return required.startsWith(namespace)
}

function policyMatches(grants: readonly string[], policy: AccessPolicy): boolean {
  const holds = (required: string) => grants.some(grant => permissionGrantMatches(grant, required))

  return policy.match === 'all' ? policy.permissions.every(holds) : policy.permissions.some(holds)
}

function organizationGrants(context: OrganizationContext): string[] {
  return context.permissions.flatMap(permission => {
    const key = `${permission.subject}:${permission.action}`
    return permission.subject === 'all' && permission.action === 'manage' ? [key, '*'] : [key]
  })
}

@Injectable()
export class AccessPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly organizationContextService: OrganizationContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!policy) return true
    if (policy.permissions.length === 0) {
      throw new ForbiddenException('Access policy has no configured permissions')
    }

    const request = getRequest(context)
    if (!request.user?.id) throw new UnauthorizedException()

    const grants =
      policy.scope === 'platform'
        ? await this.getPlatformGrants(request)
        : await this.getOrganizationGrants(context, request, policy)

    if (!policyMatches(grants, policy)) {
      throw new ForbiddenException('You do not have permission to perform this operation')
    }

    return true
  }

  private async getPlatformGrants(request: RequestWithAccessContext): Promise<readonly string[]> {
    if (request.user?.isSuperAdmin) return ['platform.*']

    const userId = request.user?.id
    if (!userId) return []

    const evaluator = this.moduleRef.get<PlatformPermissionEvaluator>(ACCESS_CONTROL_SERVICE, {
      strict: false,
    })
    if (!evaluator) return []

    request.__nestledPlatformPermissions ??= evaluator.getUserPlatformPermissions(userId)
    return request.__nestledPlatformPermissions
  }

  private async getOrganizationGrants(
    context: ExecutionContext,
    request: RequestWithAccessContext,
    policy: AccessPolicy,
  ): Promise<readonly string[]> {
    if (request.user?.isSuperAdmin) return ['*']

    const organizationIdValue = policy.organizationIdPath
      ? valueAtPath(getOperationValues(context), policy.organizationIdPath)
      : undefined
    if (
      policy.organizationIdPath &&
      (typeof organizationIdValue !== 'string' || organizationIdValue.trim().length === 0)
    ) {
      throw new ForbiddenException('The organization target required by this policy is missing')
    }
    const organizationId = typeof organizationIdValue === 'string' ? organizationIdValue : undefined
    const organizationContext = await this.organizationContextService.attach(
      request,
      organizationId,
    )

    return organizationContext ? organizationGrants(organizationContext) : []
  }
}
