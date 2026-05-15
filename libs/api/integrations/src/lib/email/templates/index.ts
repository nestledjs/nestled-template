// Central export for all email templates
import { TemplateDefinition } from '../email.interface'
import { emailVerificationTemplate } from './email-verification.template'
import { passwordResetTemplate } from './password-reset.template'
import { passwordChangedTemplate } from './password-changed.template'
import { welcomeTemplate } from './welcome.template'
import { twofaEnabledTemplate } from './twofa-enabled.template'
import { organizationInvitationTemplate } from './organization-invitation.template'

// Export individual templates
export { emailVerificationTemplate } from './email-verification.template'
export { passwordResetTemplate } from './password-reset.template'
export { passwordChangedTemplate } from './password-changed.template'
export { welcomeTemplate } from './welcome.template'
export { twofaEnabledTemplate } from './twofa-enabled.template'
export { organizationInvitationTemplate } from './organization-invitation.template'

// Export all templates as a Map for easy lookup
export const EMAIL_TEMPLATES: Map<string, TemplateDefinition> = new Map([
  ['email-verification', emailVerificationTemplate],
  ['password-reset', passwordResetTemplate],
  ['password-changed', passwordChangedTemplate],
  ['welcome', welcomeTemplate],
  ['twofa-enabled', twofaEnabledTemplate],
  ['organization-invitation', organizationInvitationTemplate],
])

// Helper to get a template by ID
export function getEmailTemplate(templateId: string): TemplateDefinition | undefined {
  return EMAIL_TEMPLATES.get(templateId)
}

// Export list of all available template IDs
export const AVAILABLE_TEMPLATES = Array.from(EMAIL_TEMPLATES.keys())