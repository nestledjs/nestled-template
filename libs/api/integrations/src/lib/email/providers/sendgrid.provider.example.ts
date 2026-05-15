// Example SendGrid provider implementation
// Uncomment and implement when needed

// import { Logger } from '@nestjs/common'
// import * as sgMail from '@sendgrid/mail'
// import { ConfigService } from '@nestled-template/api/config'
// import { EmailProvider, EmailOptions, EmailTemplate, EmailResult } from '../email.interface'

// export class SendGridEmailProvider implements EmailProvider {
//   private readonly logger = new Logger(SendGridEmailProvider.name)

//   constructor(private readonly config: ConfigService) {
//     sgMail.setApiKey(this.config.sendGridApiKey)
//   }

//   async send(options: EmailOptions): Promise<EmailResult> {
//     try {
//       const msg = {
//         to: options.to,
//         from: options.from!,
//         replyTo: options.replyTo,
//         cc: options.cc,
//         bcc: options.bcc,
//         subject: options.subject,
//         html: options.html,
//         text: options.text,
//         attachments: options.attachments?.map(att => ({
//           filename: att.filename,
//           content: att.content.toString('base64'),
//           type: att.contentType,
//           disposition: 'attachment',
//           contentId: att.cid,
//         })),
//       }

//       const [result] = await sgMail.send(msg)
      
//       return {
//         messageId: result.headers['x-message-id'] as string,
//         accepted: Array.isArray(options.to) ? options.to : [options.to],
//         rejected: [],
//         response: `${result.statusCode}: ${result.body}`,
//       }
//     } catch (error) {
//       this.logger.error('SendGrid send failed:', error.message)
//       throw new Error(`Email send failed: ${error.message}`)
//     }
//   }

//   async sendTemplate(
//     to: string | string[],
//     template: EmailTemplate,
//     options?: Partial<EmailOptions>
//   ): Promise<EmailResult> {
//     try {
//       const msg = {
//         to,
//         from: options?.from!,
//         replyTo: options?.replyTo,
//         templateId: template.templateId,
//         dynamicTemplateData: template.variables,
//       }

//       const [result] = await sgMail.send(msg)
      
//       return {
//         messageId: result.headers['x-message-id'] as string,
//         accepted: Array.isArray(to) ? to : [to],
//         rejected: [],
//         response: `${result.statusCode}: ${result.body}`,
//       }
//     } catch (error) {
//       this.logger.error('SendGrid template send failed:', error.message)
//       throw new Error(`Template email send failed: ${error.message}`)
//     }
//   }

//   async validateConnection(): Promise<boolean> {
//     try {
//       // SendGrid doesn't have a direct connection test, but we can test API key validity
//       await sgMail.send({
//         to: 'test@example.com',
//         from: 'test@example.com',
//         subject: 'Connection test',
//         text: 'This is a connection test',
//       }, false) // false = don't actually send
      
//       return true
//     } catch (error) {
//       this.logger.error('SendGrid connection test failed:', error.message)
//       return false
//     }
//   }
// }