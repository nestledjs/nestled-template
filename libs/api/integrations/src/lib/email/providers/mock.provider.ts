import { Logger } from '@nestjs/common'
import { EmailProvider, EmailOptions, EmailTemplate, EmailResult } from '../email.interface'
import { SimpleTemplateManager } from '../template-manager-simple'

/**
 * Mock Email Provider for testing
 * Logs emails instead of sending them, always returns success
 */
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name)
  private readonly templateManager: SimpleTemplateManager

  constructor() {
    this.templateManager = new SimpleTemplateManager()
    this.logger.log('📧 Mock Email Provider initialized (emails will be logged, not sent)')
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    this.logger.log('📨 Mock email sent:')
    this.logger.log(`   To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`)
    this.logger.log(`   Subject: ${options.subject}`)
    if (options.from) this.logger.log(`   From: ${options.from}`)

    const recipients = Array.isArray(options.to) ? options.to : [options.to]

    // Return mock success with proper EmailResult structure
    return {
      messageId: `<mock-${Date.now()}-${Math.random().toString(36).substring(7)}@mock.local>`,
      accepted: recipients,
      rejected: [],
      response: '250 Mock email accepted',
    }
  }

  async sendTemplate(
    to: string | string[],
    template: EmailTemplate,
    options?: Partial<EmailOptions>,
  ): Promise<EmailResult> {
    try {
      // Render the template to validate it works
      const rendered = await this.templateManager.renderTemplate(
        template.templateId,
        template.variables || {},
      )

      this.logger.log('📨 Mock templated email sent:')
      this.logger.log(`   To: ${Array.isArray(to) ? to.join(', ') : to}`)
      this.logger.log(`   Template: ${template.templateId}`)
      this.logger.log(`   Subject: ${rendered.subject}`)

      const recipients = Array.isArray(to) ? to : [to]

      // Return mock success with proper EmailResult structure
      return {
        messageId: `<mock-${Date.now()}-${Math.random().toString(36).substring(7)}@mock.local>`,
        accepted: recipients,
        rejected: [],
        response: '250 Mock templated email accepted',
      }
    } catch (error) {
      this.logger.error('Failed to render template:', error)
      throw error
    }
  }

  async validateConnection(): Promise<boolean> {
    this.logger.log('Mock email provider connection validated')
    return true
  }
}
