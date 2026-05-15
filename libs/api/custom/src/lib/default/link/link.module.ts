import { Module } from '@nestjs/common'
import { LinkService } from './link.service'
import { LinkResolver } from './link.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [LinkService, LinkResolver],
  exports: [LinkService, LinkResolver],
})
export class LinkModule {}
