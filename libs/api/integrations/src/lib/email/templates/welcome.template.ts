import { TemplateDefinition } from '../email.interface'

export const welcomeTemplate: TemplateDefinition = {
  id: 'welcome',
  name: 'Welcome',
  description: 'Welcome email for new users',
  subject: 'Welcome to {{appName}}!',
  requiredVariables: ['userName', 'appName'],
  optionalVariables: ['loginUrl', 'supportEmail', 'gettingStartedUrl'],

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
        .feature { padding: 15px; margin: 10px 0; background: #f9fafb; border-radius: 6px; }
        h2 { color: #4b5563; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to {{appName}}!</h1>
        </div>
        <div class="content">
          <p>Hi {{userName}},</p>

          <p>Welcome aboard! We're excited to have you as part of our community.</p>

          <h2>Getting Started</h2>
          <p>Here are some things you can do to get the most out of {{appName}}:</p>

          <div class="feature">
            <strong>✅ Complete your profile</strong><br>
            Add more information to help others connect with you
          </div>

          <div class="feature">
            <strong>🔍 Explore features</strong><br>
            Discover all the tools and features available to you
          </div>

          <div class="feature">
            <strong>🤝 Connect with others</strong><br>
            Join groups and start collaborating
          </div>

          {{#if loginUrl}}
          <div style="text-align: center;">
            <a href="{{loginUrl}}" class="button">Go to Dashboard</a>
          </div>
          {{/if}}

          {{#if gettingStartedUrl}}
          <p>Need help? Check out our <a href="{{gettingStartedUrl}}">Getting Started Guide</a></p>
          {{/if}}

          <div class="footer">
            <p>Best regards,<br>The {{appName}} Team</p>
            {{#if supportEmail}}
            <p>Questions? Contact us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
            {{/if}}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,

  textTemplate: `
Hi {{userName}},

Welcome to {{appName}}! We're excited to have you as part of our community.

Getting Started:

✅ Complete your profile - Add more information to help others connect with you
🔍 Explore features - Discover all the tools and features available to you
🤝 Connect with others - Join groups and start collaborating

{{#if loginUrl}}
Go to your dashboard: {{loginUrl}}
{{/if}}

{{#if gettingStartedUrl}}
Need help? Check out our Getting Started Guide: {{gettingStartedUrl}}
{{/if}}

Best regards,
The {{appName}} Team

{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}
{{/if}}
  `.trim(),
}
