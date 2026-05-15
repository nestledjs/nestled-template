import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestled-template/api/config'
import { EmailProvider, EmailOptions, EmailTemplate, EmailResult } from './email.interface'
import { SmtpEmailProvider } from './providers/smtp.provider'
import { MockEmailProvider } from './providers/mock.provider'
// Future providers:
// import { SendGridEmailProvider } from './providers/sendgrid.provider'
// import { MailgunEmailProvider } from './providers/mailgun.provider'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly provider: EmailProvider
  private readonly appName: string
  private readonly appEmail: string
  private readonly appSupportEmail: string

  constructor(private readonly config: ConfigService) {
    this.appName = this.config.appName
    this.appEmail = this.config.appEmail
    this.appSupportEmail = this.config.appSupportEmail

    // Initialize provider based on config
    const providerType = this.config.emailProvider
    this.logger.log(`Initializing email provider: ${providerType}`)

    switch (providerType) {
      case 'smtp':
        this.provider = new SmtpEmailProvider(config)
        break
      case 'mock':
      case 'test':
        this.provider = new MockEmailProvider()
        break
      // case 'sendgrid':
      //   this.provider = new SendGridEmailProvider(config)
      //   break
      // case 'mailgun':
      //   this.provider = new MailgunEmailProvider(config)
      //   break
      default:
        throw new Error(`Unsupported email provider: ${providerType}`)
    }
  }

  /**
   * Send a simple email
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    return this.sendEmail(options)
  }

  /**
   * Send a simple email (full method name)
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const emailOptions: EmailOptions = {
        ...options,
        from: options.from ?? `${this.appName} <${this.appEmail}>`,
        replyTo: options.replyTo ?? this.appSupportEmail,
      }

      const result = await this.provider.send(emailOptions)
      
      this.logger.log(`Email sent successfully to ${options.to}: ${result.messageId}`)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Failed to send email to ${options.to}:`, errorMessage)
      throw error
    }
  }

  /**
   * Send a templated email
   */
  async sendTemplate(
    to: string | string[],
    template: EmailTemplate,
    options?: Partial<EmailOptions>
  ): Promise<EmailResult> {
    return this.sendTemplatedEmail(to, template, options)
  }

  /**
   * Send a templated email (full method name)
   */
  async sendTemplatedEmail(
    to: string | string[],
    template: EmailTemplate,
    options?: Partial<EmailOptions>
  ): Promise<EmailResult> {
    try {
      const result = await this.provider.sendTemplate(to, template, {
        from: `${this.appName} <${this.appEmail}>`,
        replyTo: this.appSupportEmail,
        ...options,
      })

      this.logger.log(`Templated email sent successfully to ${to}: ${result.messageId}`)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Failed to send templated email to ${to}:`, errorMessage)
      throw error
    }
  }

  /**
   * Convenience methods for common email types
   */
  async sendWelcomeEmail(to: string, userName: string): Promise<EmailResult> {
    return this.sendTemplatedEmail(to, {
      templateId: 'welcome',
      variables: { userName, appName: this.appName }
    })
  }

  async sendPasswordResetEmail(to: string, resetToken: string, userName: string): Promise<EmailResult> {
    const resetUrl = `${this.config.frontendUrl}/reset-password?token=${resetToken}`
    
    return this.sendEmail({
      to,
      subject: `Reset your ${this.appName} password`,
      html: this.getPasswordResetHtml(userName, resetUrl),
      text: this.getPasswordResetText(userName, resetUrl),
    })
  }

  async sendEmailVerification(to: string, verificationToken: string, userName: string): Promise<EmailResult> {
    const verificationUrl = `${this.config.frontendUrl}/verify-email?token=${verificationToken}`
    
    return this.sendEmail({
      to,
      subject: `Verify your ${this.appName} email address`,
      html: this.getEmailVerificationHtml(userName, verificationUrl),
      text: this.getEmailVerificationText(userName, verificationUrl),
    })
  }

  async sendInvitationEmail(
    to: string,
    inviterName: string,
    organizationName: string,
    invitationToken: string
  ): Promise<EmailResult> {
    const invitationUrl = `${this.config.frontendUrl}/accept-invitation?token=${invitationToken}`
    
    return this.sendEmail({
      to,
      subject: `You're invited to join ${organizationName} on ${this.appName}`,
      html: this.getInvitationHtml(inviterName, organizationName, invitationUrl),
      text: this.getInvitationText(inviterName, organizationName, invitationUrl),
    })
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.provider.validateConnection()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error('Email connection test failed:', errorMessage)
      return false
    }
  }

  // Private template methods (could be moved to separate template service)
  private getPasswordResetHtml(userName: string, resetUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Reset Your Password</h1>
        <p>Hi ${userName},</p>
        <p>You requested to reset your password for ${this.appName}. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #007cba; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
      </div>
    `
  }

  private getPasswordResetText(userName: string, resetUrl: string): string {
    return `
Hi ${userName},

You requested to reset your password for ${this.appName}. 

To reset your password, visit this link:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email.

Thanks,
The ${this.appName} Team
    `.trim()
  }

  private getEmailVerificationHtml(userName: string, verificationUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Verify Your Email</h1>
        <p>Hi ${userName},</p>
        <p>Thanks for signing up for ${this.appName}! To complete your registration, please verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>Welcome to ${this.appName}!</p>
      </div>
    `
  }

  private getEmailVerificationText(userName: string, verificationUrl: string): string {
    return `
Hi ${userName},

Thanks for signing up for ${this.appName}! To complete your registration, please verify your email address by visiting this link:

${verificationUrl}

Welcome to ${this.appName}!

Thanks,
The ${this.appName} Team
    `.trim()
  }

  private getInvitationHtml(inviterName: string, organizationName: string, invitationUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>You're Invited!</h1>
        <p>${inviterName} has invited you to join <strong>${organizationName}</strong> on ${this.appName}.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" style="background-color: #6f42c1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${invitationUrl}">${invitationUrl}</a></p>
        <p>This invitation will expire in 7 days.</p>
      </div>
    `
  }

  private getInvitationText(inviterName: string, organizationName: string, invitationUrl: string): string {
    return `
${inviterName} has invited you to join ${organizationName} on ${this.appName}.

To accept this invitation, visit:
${invitationUrl}

This invitation will expire in 7 days.

Thanks,
The ${this.appName} Team
    `.trim()
  }
}