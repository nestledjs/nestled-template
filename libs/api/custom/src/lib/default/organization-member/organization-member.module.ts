import { Module } from '@nestjs/common'
import { OrganizationMemberService } from './organization-member.service'
import { OrganizationMemberResolver } from './organization-member.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [OrganizationMemberService, OrganizationMemberResolver],
  exports: [OrganizationMemberService, OrganizationMemberResolver],
})
export class OrganizationMemberModule {}
