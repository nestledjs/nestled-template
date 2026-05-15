import { Module } from '@nestjs/common'
import { SmsService } from './sms.service'
import { ConfigModule } from '@nestled-template/api/config'

@Module({
  imports: [ConfigModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
