import { Module } from '@nestjs/common'
import { UserPreferenceService } from './user-preference.service'
import { UserPreferenceResolver } from './user-preference.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [UserPreferenceService, UserPreferenceResolver],
  exports: [UserPreferenceService, UserPreferenceResolver],
})
export class UserPreferenceModule {}
