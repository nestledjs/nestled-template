import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { ConfigModule } from '@nestled-template/api/config'
import { SimpleTemplateManager } from './template-manager-simple'

@Module({
  imports: [ConfigModule],
  providers: [EmailService, SimpleTemplateManager],
  exports: [EmailService, SimpleTemplateManager],
})
export class EmailIntegrationModule {}