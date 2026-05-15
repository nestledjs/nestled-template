import { Module } from '@nestjs/common'
import { ContactMailerService } from './contact-mailer.service'
import { EmailIntegrationModule } from '@nestled-template/api/integrations'

@Module({
  imports: [EmailIntegrationModule],
  providers: [ContactMailerService],
  exports: [ContactMailerService],
})
export class ContactMailerModule {}
