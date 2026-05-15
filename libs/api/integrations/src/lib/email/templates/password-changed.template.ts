import { TemplateDefinition } from '../email.interface'

export const passwordChangedTemplate: TemplateDefinition = {
  id: 'password-changed',
  name: 'Password Changed',
  description: 'Notification when password is successfully changed',
  subject: 'Your {{appName}} password has been changed',
  requiredVariables: ['userName', 'appName'],
  optionalVariables: ['supportEmail', 'securityUrl', 'changeTime'],

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
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; color: #6b7280; font-size: 14px; }
        .alert { background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
        .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Changed Successfully</h1>
        </div>
        <div class="content">
          <p>Hi {{userName}},</p>

          <div class="success">
            <strong>Success!</strong> Your {{appName}} account password has been changed successfully.
          </div>

          {{#if changeTime}}
          <p>This email confirms that your password was changed at {{formatDate changeTime}}.</p>
          {{else}}
          <p>This email confirms that your password was just changed.</p>
          {{/if}}

          <div class="alert">
            <strong>Wasn't you?</strong> If you didn't change your password, please contact our support team immediately as your account may be compromised.
          </div>

          <div class="footer">
            <p>Best regards,<br>The {{appName}} Team</p>
            {{#if supportEmail}}
            <p>Need help? Contact us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
            {{/if}}
            {{#if securityUrl}}
            <p><a href="{{securityUrl}}">Review your account security settings</a></p>
            {{/if}}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,

  textTemplate: `
Hi {{userName}},

Your {{appName}} account password has been changed successfully.

{{#if changeTime}}
This change was made at {{formatDate changeTime}}.
{{else}}
This change was just made.
{{/if}}

If you didn't change your password, please contact our support team immediately as your account may be compromised.

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Need help? Contact us at {{supportEmail}}
{{/if}}

{{#if securityUrl}}
Review your account security settings: {{securityUrl}}
{{/if}}
  `.trim()
}