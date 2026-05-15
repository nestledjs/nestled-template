import { Module } from '@nestjs/common'
import { AddressService } from './address.service'
import { AddressResolver } from './address.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [AddressService, AddressResolver],
  exports: [AddressService, AddressResolver],
})
export class AddressModule {}
