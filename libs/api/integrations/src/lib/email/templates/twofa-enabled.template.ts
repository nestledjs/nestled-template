import { TemplateDefinition } from '../email.interface'

export const twofaEnabledTemplate: TemplateDefinition = {
  id: 'twofa-enabled',
  name: 'Two-Factor Authentication Enabled',
  description: 'Notification when 2FA is successfully enabled',
  subject: 'Two-Factor Authentication enabled for your {{appName}} account',
  requiredVariables: ['userName', 'appName'],
  optionalVariables: ['supportEmail', 'securityUrl', 'enableTime', 'backupCodesCount'],

  htmlTemplate: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e1e4e8; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; color: #6b7280; font-size: 14px; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
        .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; }
        .info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; margin: 20px 0; }
        ul { padding-left: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 Two-Factor Authentication Enabled</h1>
        </div>
        <div class="content">
          <p>Hi {{userName}},</p>

          <div class="success">
            <strong>Success!</strong> Two-factor authentication (2FA) has been enabled for your {{appName}} account.
          </div>

          {{#if enableTime}}
          <p>This security feature was activated at {{formatDate enableTime}}.</p>
          {{else}}
          <p>This security feature was just activated.</p>
          {{/if}}

          <div class="info">
            <strong>What this means:</strong>
            <ul>
              <li>Your account is now more secure than ever</li>
              <li>You'll need your authenticator app code when logging in</li>
              <li>{{#if backupCodesCount}}You have {{backupCodesCount}} backup codes{{else}}You have backup codes{{/if}} in case you lose access to your authenticator</li>
            </ul>
          </div>

          <div class="alert">
            <strong>Important reminders:</strong>
            <ul>
              <li>Keep your backup codes in a safe place</li>
              <li>Don't share your authenticator app with anyone</li>
              <li>If you lose access to your authenticator, use a backup code</li>
            </ul>
          </div>

          <div class="alert">
            <strong>Wasn't you?</strong> If you didn't enable two-factor authentication, please contact our support team immediately as your account may be compromised.
          </div>

          <div class="footer">
            <p>Best regards,<br>The {{appName}} Team</p>
            {{#if supportEmail}}
            <p>Need help? Contact us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
            {{/if}}
            {{#if securityUrl}}
            <p><a href="{{securityUrl}}">Manage your security settings</a></p>
            {{/if}}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,

  textTemplate: `
Hi {{userName}},

Two-factor authentication (2FA) has been enabled for your {{appName}} account.

{{#if enableTime}}
This security feature was activated at {{formatDate enableTime}}.
{{else}}
This security feature was just activated.
{{/if}}

What this means:
- Your account is now more secure than ever
- You'll need your authenticator app code when logging in
- {{#if backupCodesCount}}You have {{backupCodesCount}} backup codes{{else}}You have backup codes{{/if}} in case you lose access to your authenticator

Important reminders:
- Keep your backup codes in a safe place
- Don't share your authenticator app with anyone
- If you lose access to your authenticator, use a backup code

WASN'T YOU? If you didn't enable two-factor authentication, please contact our support team immediately as your account may be compromised.

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Need help? Contact us at {{supportEmail}}
{{/if}}

{{#if securityUrl}}
Manage your security settings: {{securityUrl}}
{{/if}}
  `.trim()
}