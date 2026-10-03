import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { SimpleTemplateManager } from './template-manager-simple'

@Module({
  providers: [EmailService, SimpleTemplateManager],
  exports: [EmailService, SimpleTemplateManager],
})
export class EmailIntegrationModule {}
