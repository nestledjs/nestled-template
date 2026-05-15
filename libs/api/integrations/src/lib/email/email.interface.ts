// Universal email interface that works with any provider
export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
  encoding?: string
  cid?: string // for inline images
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  attachments?: EmailAttachment[]
}

export interface EmailTemplate {
  templateId: string
  variables?: Record<string, any>
}

export interface TemplateDefinition {
  id: string
  name: string
  description?: string
  subject: string
  htmlTemplate: string
  textTemplate?: string
  requiredVariables: string[]
  optionalVariables?: string[]
}

export interface TemplateManager {
  getTemplate(templateId: string): Promise<TemplateDefinition>
  renderTemplate(templateId: string, variables: Record<string, any>): Promise<{
    subject: string
    html: string
    text?: string
  }>
}

export interface EmailResult {
  messageId: string
  accepted: string[]
  rejected: string[]
  response: string
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<EmailResult>
  sendTemplate(to: string | string[], template: EmailTemplate, options?: Partial<EmailOptions>): Promise<EmailResult>
  validateConnection(): Promise<boolean>
}