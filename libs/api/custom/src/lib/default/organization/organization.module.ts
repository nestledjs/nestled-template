import { Module } from '@nestjs/common'
import { OrganizationService } from './organization.service'
import { OrganizationResolver } from './organization.resolver'
import { EmailIntegrationModule } from '@nestled-template/api/integrations'
import { AuthCacheService } from '@nestled-template/api/utils'

@Module({
  imports: [EmailIntegrationModule],
  providers: [OrganizationService, OrganizationResolver, AuthCacheService],
  exports: [OrganizationService, OrganizationResolver, AuthCacheService],
})
export class OrganizationModule {}
