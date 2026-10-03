import { TemplateDefinition } from '../email.interface'

export const passwordResetTemplate: TemplateDefinition = {
  id: 'password-reset',
  name: 'Password Reset',
  description: 'Email sent when user requests password reset',
  subject: 'Reset your {{appName}} password',
  requiredVariables: ['userName', 'resetUrl', 'appName'],
  optionalVariables: ['expirationMinutes', 'supportEmail'],

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
        .button { display: inline-block; padding: 14px 30px; background: #ef4444; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; color: #6b7280; font-size: 14px; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
        .security { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi {{userName}},</p>

          <p>We received a request to reset your password for your {{appName}} account. Click the button below to create a new password:</p>

          <div style="text-align: center;">
            <a href="{{resetUrl}}" class="button">Reset Password</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px;">
            {{resetUrl}}
          </p>

          {{#if expirationMinutes}}
          <div class="warning">
            <strong>Important:</strong> This password reset link will expire in {{expirationMinutes}} minutes for security reasons.
          </div>
          {{/if}}

          <div class="security">
            <strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
          </div>

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
Hi {{userName}},

We received a request to reset your password for your {{appName}} account.

To reset your password, visit this link:

{{resetUrl}}

{{#if expirationMinutes}}
Important: This password reset link will expire in {{expirationMinutes}} minutes for security reasons.
{{/if}}

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Need help? Contact us at {{supportEmail}}
{{/if}}
  `.trim(),
}
