import { TemplateDefinition } from '../email.interface'

export const emailVerificationTemplate: TemplateDefinition = {
  id: 'email-verification',
  name: 'Email Verification',
  description: 'Email sent to users to verify their email address',
  subject: 'Verify your email address - {{appName}}',
  requiredVariables: ['userName', 'verificationUrl', 'appName'],
  optionalVariables: ['companyName', 'supportEmail', 'expirationHours'],

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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to {{appName}}!</h1>
        </div>
        <div class="content">
          <p>Hi {{userName}},</p>

          <p>Thank you for signing up! To complete your registration and access all features, please verify your email address by clicking the button below:</p>

          <div style="text-align: center;">
            <a href="{{verificationUrl}}" class="button">Verify Email Address</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px;">
            {{verificationUrl}}
          </p>

          {{#if expirationHours}}
          <div class="warning">
            <strong>Note:</strong> This verification link will expire in {{expirationHours}} hours for security reasons.
          </div>
          {{/if}}

          <p>If you didn't create an account with us, you can safely ignore this email.</p>

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

Thank you for signing up for {{appName}}!

To complete your registration and access all features, please verify your email address by visiting this link:

{{verificationUrl}}

{{#if expirationHours}}
Note: This verification link will expire in {{expirationHours}} hours for security reasons.
{{/if}}

If you didn't create an account with us, you can safely ignore this email.

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Need help? Contact us at {{supportEmail}}
{{/if}}
  `.trim()
}