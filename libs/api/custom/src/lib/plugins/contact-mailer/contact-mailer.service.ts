import { Injectable, Logger } from '@nestjs/common'
import { EmailService } from '@nestled-template/api/integrations'

export interface ContactFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  questions: string
  chapterName?: string
  chapterLocation?: string
}

@Injectable()
export class ContactMailerService {
  private readonly logger = new Logger('ContactMailerService')

  // Placeholder notification recipient. Clone-identity rewrites the `nestled-template` token
  // wherever it appears, so real addresses hardcoded here get mangled into plausible-but-fake
  // domains in every clone (e.g. `jennifer@<project>now.com`) and notifications silently vanish.
  // Set the real recipients per deployment via APP_ADMIN_EMAILS instead of editing this list.
  private readonly adminEmails = ['test@test.com']

  constructor(private readonly emailService: EmailService) {}

  async sendContactFormNotification(data: ContactFormData) {
    const { firstName, lastName, email, phone, questions, chapterName, chapterLocation } = data

    const subject = `New Contact Form Submission - ${firstName} ${lastName}`

    const html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${firstName} ${lastName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      ${chapterName ? `<p><strong>Chapter:</strong> ${chapterName}</p>` : ''}
      ${chapterLocation ? `<p><strong>Location:</strong> ${chapterLocation}</p>` : ''}
      <p><strong>Message:</strong></p>
      <p>${questions}</p>
      <hr>
      <p><em>This email was sent from the nestled-template contact form.</em></p>
    `

    const text = `
      New Contact Form Submission

      Name: ${firstName} ${lastName}
      Email: ${email}
      Phone: ${phone}
      ${chapterName ? `Chapter: ${chapterName}` : ''}
      ${chapterLocation ? `Location: ${chapterLocation}` : ''}

      Message:
      ${questions}

      This email was sent from the nestled-template contact form.
    `

    // Send to all admin emails
    const emailPromises = this.adminEmails.map(adminEmail =>
      this.emailService.send({
        to: adminEmail,
        subject,
        html,
        text,
      }),
    )

    try {
      await Promise.all(emailPromises)
      this.logger.log(
        `Contact form notification sent to ${this.adminEmails.length} admin emails for ${firstName} ${lastName}`,
      )
    } catch (error) {
      this.logger.error(
        `Failed to send contact form notification: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }

  async sendGuestConfirmationEmail(data: ContactFormData) {
    const { firstName, email, chapterName, chapterLocation } = data

    const subject = `Thank you for your interest in nestled-template!`

    const chapterLocationSuffix = chapterLocation ? ` in ${chapterLocation}` : ''
    const chapterHtmlLine = chapterName
      ? `<p>We see you're interested in the ${chapterName} chapter${chapterLocationSuffix}. We'll make sure to connect you with the right people!</p>`
      : ''
    const chapterTextLine = chapterName
      ? `We see you're interested in the ${chapterName} chapter${chapterLocationSuffix}. We'll make sure to connect you with the right people!`
      : ''

    const html = `
      <h2>Thank you for contacting nestled-template!</h2>
      <p>Dear ${firstName},</p>
      <p>Thank you for your interest in nestled-template. We have received your inquiry and one of our team members will be in touch with you soon.</p>
      ${chapterHtmlLine}
      <p>In the meantime, feel free to browse our website to learn more about our networking community and the benefits of membership.</p>
      <p>Best regards,<br>
      The nestled-template Team</p>
      <hr>
      <p><em>This is an automated response. Please do not reply to this email.</em></p>
    `

    const text = `
      Thank you for contacting nestled-template!

      Dear ${firstName},

      Thank you for your interest in nestled-template. We have received your inquiry and one of our team members will be in touch with you soon.

      ${chapterTextLine}

      In the meantime, feel free to browse our website to learn more about our networking community and the benefits of membership.

      Best regards,
      The nestled-template Team

      This is an automated response. Please do not reply to this email.
    `

    try {
      await this.emailService.send({
        to: email,
        subject,
        html,
        text,
      })
      this.logger.log(`Guest confirmation email sent to ${email}`)
    } catch (error) {
      this.logger.error(
        `Failed to send guest confirmation email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }
}
