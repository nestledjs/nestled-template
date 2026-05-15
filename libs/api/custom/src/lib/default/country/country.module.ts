import { Module } from '@nestjs/common'
import { CountryService } from './country.service'
import { CountryResolver } from './country.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [CountryService, CountryResolver],
  exports: [CountryService, CountryResolver],
})
export class CountryModule {}
