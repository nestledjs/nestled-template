import { Global, Module } from '@nestjs/common'
import { ConfigService } from './config.service'
import { PublicUrlService } from './public-url.service'

@Global()
@Module({
  providers: [ConfigService, PublicUrlService],
  exports: [ConfigService, PublicUrlService],
})
export class ConfigModule {}
