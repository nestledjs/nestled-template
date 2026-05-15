import { Injectable } from '@nestjs/common'
import { Twilio } from 'twilio'
import { ConfigService } from '@nestled-template/api/config'

@Injectable()
export class SmsService {
  private readonly client!: Twilio
  constructor(private readonly config: ConfigService) {
    if (this.config.twilio.accountSid !== 'none' && this.config.twilio.authToken !== 'none') {
      this.client = new Twilio(this.config.twilio.accountSid, this.config.twilio.authToken)
    }
  }

  send({ body, to }: { body: string; to: string }) {
    if (!this.client) {
      throw new Error(
        `Twilio client not initialized. Did you set the correct environment variables?`,
      )
    }
    return this.client.messages.create({
      from: this.config.twilio.fromNumber,
      to,
      body,
    })
  }
}
