import { Global, Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { AuthCacheService } from '../services/auth-cache.service'
import { OrganizationContextService } from '../services/organization-context.service'
import { GlobalAuthGuard } from './global-auth.guard'
import { GqlAuthAdminGuard } from './gql-auth-admin.guard'
import { GqlAuthGuard } from './gql-auth.guard'
import { GqlOrganizationScopedGuard } from './gql-organization-scoped.guard'
import { PermissionsGuard } from './permissions.guard'
import { SubscriptionGuard } from './subscription.guard'
import { AccessPolicyGuard } from './access-policy.guard'

@Global()
@Module({
  imports: [ApiCoreDataAccessModule],
  providers: [
    AuthCacheService,
    OrganizationContextService,
    GqlAuthGuard,
    GqlAuthAdminGuard,
    GlobalAuthGuard,
    GqlOrganizationScopedGuard,
    PermissionsGuard,
    SubscriptionGuard,
    AccessPolicyGuard,
  ],
  exports: [
    AuthCacheService,
    OrganizationContextService,
    GqlAuthGuard,
    GqlAuthAdminGuard,
    GlobalAuthGuard,
    GqlOrganizationScopedGuard,
    PermissionsGuard,
    SubscriptionGuard,
    AccessPolicyGuard,
  ],
})
export class GuardsModule {}
