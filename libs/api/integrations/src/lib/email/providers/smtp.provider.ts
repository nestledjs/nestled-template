import { Logger } from '@nestjs/common'
import { createTransport, Transporter } from 'nodemailer'
import { ConfigService } from '@nestled-template/api/config'
import {
  EmailOptions,
  EmailProvider,
  EmailResult,
  EmailTemplate,
  TemplateManager,
} from '../email.interface'
import { SimpleTemplateManager } from '../template-manager-simple'

export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name)
  private readonly transporter: Transporter
  private readonly templateManager: TemplateManager

  constructor(private readonly config: ConfigService) {
    this.templateManager = new SimpleTemplateManager()
    this.transporter = createTransport({
      host: this.config.mailerConfig.host,
      port: Number.parseInt(this.config.mailerConfig.port.toString()),
      secure: this.config.mailerConfig.secure,
      auth: {
        user: this.config.mailerConfig.auth.user,
        pass: this.config.mailerConfig.auth.pass,
      },
      // Add connection pooling and retry logic
      pool: true,
      maxConnections: 3,
      maxMessages: 10,
      rateDelta: 1000,
      rateLimit: 5,
    })
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const result = await this.transporter.sendMail({
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        from: options.from,
        replyTo: options.replyTo,
        cc: Array.isArray(options.cc) ? options.cc.join(', ') : options.cc,
        bcc: Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          encoding: att.encoding,
          cid: att.cid,
        })),
      })

      return {
        messageId: result.messageId || '',
        accepted: (result.accepted || []) as string[],
        rejected: (result.rejected || []) as string[],
        response: result.response || '',
      }
    } catch (error) {
      this.logger.error('SMTP send failed:', (error as Error).message)
      throw new Error(`Email send failed: ${(error as Error).message}`)
    }
  }

  async sendTemplate(
    to: string | string[],
    template: EmailTemplate,
    options?: Partial<EmailOptions>,
  ): Promise<EmailResult> {
    try {
      // Render the template
      const rendered = await this.templateManager.renderTemplate(
        template.templateId,
        template.variables || {},
      )

      // Merge with provided options
      const emailOptions: EmailOptions = {
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...options, // Allow overriding any of the above
      }

      // Send using the regular send method
      return this.send(emailOptions)
    } catch (error) {
      this.logger.error(
        `Template send failed for ${template.templateId}:`,
        (error as Error).message,
      )
      throw new Error(`Template email send failed: ${(error as Error).message}`)
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const result = await this.transporter.verify()
      this.logger.log('SMTP connection verified successfully')
      return result
    } catch (error) {
      this.logger.error('SMTP connection verification failed:', (error as Error).message)
      return false
    }
  }
}
