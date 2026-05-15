import { Module } from '@nestjs/common'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedAddressResolver } from './address.resolver'
import { GeneratedApiTokenResolver } from './api-token.resolver'
import { GeneratedAuditLogResolver } from './audit-log.resolver'
import { GeneratedCountryResolver } from './country.resolver'
import { GeneratedEmailResolver } from './email.resolver'
import { GeneratedInviteResolver } from './invite.resolver'
import { GeneratedLinkResolver } from './link.resolver'
import { GeneratedLoginAttemptResolver } from './login-attempt.resolver'
import { GeneratedOAuthAccountResolver } from './oauth-account.resolver'
import { GeneratedOrganizationResolver } from './organization.resolver'
import { GeneratedOrganizationMemberResolver } from './organization-member.resolver'
import { GeneratedPermissionResolver } from './permission.resolver'
import { GeneratedPhoneNumberResolver } from './phone-number.resolver'
import { GeneratedPlanResolver } from './plan.resolver'
import { GeneratedRoleResolver } from './role.resolver'
import { GeneratedSecurityEventResolver } from './security-event.resolver'
import { GeneratedSubscriptionResolver } from './subscription.resolver'
import { GeneratedTeamResolver } from './team.resolver'
import { GeneratedTeamMemberResolver } from './team-member.resolver'
import { GeneratedStoredFileResolver } from './stored-file.resolver'
import { GeneratedUserResolver } from './user.resolver'
import { GeneratedUserPreferenceResolver } from './user-preference.resolver'
import { GeneratedUserSessionResolver } from './user-session.resolver'
import { GeneratedPasswordHistoryResolver } from './password-history.resolver'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [
    GeneratedAddressResolver,
    GeneratedApiTokenResolver,
    GeneratedAuditLogResolver,
    GeneratedCountryResolver,
    GeneratedEmailResolver,
    GeneratedInviteResolver,
    GeneratedLinkResolver,
    GeneratedLoginAttemptResolver,
    GeneratedOAuthAccountResolver,
    GeneratedOrganizationResolver,
    GeneratedOrganizationMemberResolver,
    GeneratedPermissionResolver,
    GeneratedPhoneNumberResolver,
    GeneratedPlanResolver,
    GeneratedRoleResolver,
    GeneratedSecurityEventResolver,
    GeneratedSubscriptionResolver,
    GeneratedTeamResolver,
    GeneratedTeamMemberResolver,
    GeneratedStoredFileResolver,
    GeneratedUserResolver,
    GeneratedUserPreferenceResolver,
    GeneratedUserSessionResolver,
    GeneratedPasswordHistoryResolver,
  ],
})
export class ApiGeneratedCrudFeatureModule {}
