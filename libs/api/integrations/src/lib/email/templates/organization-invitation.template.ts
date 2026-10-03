import { TemplateDefinition } from '../email.interface'

export const organizationInvitationTemplate: TemplateDefinition = {
  id: 'organization-invitation',
  name: 'Organization Invitation',
  description: 'Email sent to invite users to join an organization',
  subject: "You've been invited to join {{organizationName}} on {{appName}}",
  requiredVariables: ['organizationName', 'inviterName', 'invitationUrl', 'appName'],
  optionalVariables: ['companyName', 'supportEmail', 'expirationDays'],

  htmlTemplate: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e1e4e8; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 14px 30px; background: #10b981; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; color: #6b7280; font-size: 14px; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
        .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 You're Invited!</h1>
        </div>
        <div class="content">
          <p>Hello!</p>

          <div class="info-box">
            <strong>{{inviterName}}</strong> has invited you to join <strong>{{organizationName}}</strong> on {{appName}}.
          </div>

          <p>By accepting this invitation, you'll be able to collaborate with your team and access shared resources within the organization.</p>

          <div style="text-align: center;">
            <a href="{{invitationUrl}}" class="button">Accept Invitation</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px;">
            {{invitationUrl}}
          </p>

          {{#if expirationDays}}
          <div class="warning">
            <strong>Note:</strong> This invitation will expire in {{expirationDays}} days.
          </div>
          {{/if}}

          <p>If you weren't expecting this invitation or don't want to join this organization, you can safely ignore this email.</p>

          <div class="footer">
            <p>Best regards,<br>The {{appName}} Team</p>
            {{#if supportEmail}}
            <p>Need help? Contact us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
            {{/if}}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,

  textTemplate: `
Hello!

{{inviterName}} has invited you to join {{organizationName}} on {{appName}}.

By accepting this invitation, you'll be able to collaborate with your team and access shared resources within the organization.

To accept the invitation, visit this link:

{{invitationUrl}}

{{#if expirationDays}}
Note: This invitation will expire in {{expirationDays}} days.
{{/if}}

If you weren't expecting this invitation or don't want to join this organization, you can safely ignore this email.

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Need help? Contact us at {{supportEmail}}
{{/if}}
  `.trim(),
}
