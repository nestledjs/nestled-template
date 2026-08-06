import { Module } from '@nestjs/common'
import { UserPreferenceService } from './user-preference.service'
import { UserPreferenceResolver } from './user-preference.resolver'

@Module({
  providers: [UserPreferenceService, UserPreferenceResolver],
  exports: [UserPreferenceService, UserPreferenceResolver],
})
export class UserPreferenceModule {}
