import { Module } from '@nestjs/common'
import { PhoneNumberService } from './phone-number.service'
import { PhoneNumberResolver } from './phone-number.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [PhoneNumberService, PhoneNumberResolver],
  exports: [PhoneNumberService, PhoneNumberResolver],
})
export class PhoneNumberModule {}
