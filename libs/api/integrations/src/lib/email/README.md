# Email Integration Library

A comprehensive, provider-agnostic email service with Handlebars template support for NestJS applications.

## 🚀 Features

- ✅ **Provider-agnostic** - Switch email providers without changing your code
- ✅ **Handlebars templates** - Dynamic email templates with professional styling
- ✅ **Template caching** - Compiled templates cached for performance
- ✅ **Type-safe** - Full TypeScript support with interfaces
- ✅ **Production-ready** - Error handling, retry logic, connection pooling
- ✅ **Extensible** - Easy to add new providers and templates

## 📦 Installation & Setup

Import the module in your NestJS application:

```typescript
import { EmailModule } from '@nestled-template/api/integrations'

@Module({
  imports: [EmailModule],
})
export class AppModule {}
```

## ⚡ Quick Usage Examples

### Basic Email Sending
```typescript
import { EmailService } from '@nestled-template/api/integrations'

@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  // Send custom email
  async sendCustomEmail() {
    await this.emailService.send({
      to: 'user@example.com',
      subject: 'Welcome!',
      html: '<h1>Welcome to our app!</h1>',
      text: 'Welcome to our app!'
    })
  }
}
```

### Template-Based Emails
```typescript
// Send using pre-built templates
await this.emailService.sendTemplate('user@example.com', {
  templateId: 'email-verification',
  variables: {
    userName: 'John Doe',
    verificationUrl: 'https://app.com/verify?token=abc123',
    appName: 'MyApp',
    expirationHours: 24
  }
})

// With optional email options override
await this.emailService.sendTemplate('user@example.com', {
  templateId: 'welcome',
  variables: { userName: 'Jane', appName: 'MyApp' }
}, {
  from: 'custom@myapp.com',
  replyTo: 'support@myapp.com'
})
```

### Authentication Flow Examples
```typescript
@Injectable() 
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  async sendEmailVerification(email: string, verificationToken: string, userName: string) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
    
    await this.emailService.sendTemplate(email, {
      templateId: 'email-verification',
      variables: {
        userName,
        verificationUrl,
        appName: process.env.APP_NAME,
        supportEmail: process.env.SUPPORT_EMAIL,
        expirationHours: 24
      }
    })
  }

  async sendPasswordReset(email: string, resetToken: string, userName: string) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    
    await this.emailService.sendTemplate(email, {
      templateId: 'password-reset',
      variables: {
        userName,
        resetUrl,
        appName: process.env.APP_NAME,
        supportEmail: process.env.SUPPORT_EMAIL,
        expirationMinutes: 30
      }
    })
  }

  async sendWelcomeEmail(email: string, userName: string) {
    await this.emailService.sendTemplate(email, {
      templateId: 'welcome',
      variables: {
        userName,
        appName: process.env.APP_NAME,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
        supportEmail: process.env.SUPPORT_EMAIL
      }
    })
  }

  async notifyPasswordChanged(email: string, userName: string, changeDetails: any) {
    await this.emailService.sendTemplate(email, {
      templateId: 'password-changed',
      variables: {
        userName,
        appName: process.env.APP_NAME,
        changeTime: new Date(),
        ipAddress: changeDetails.ip,
        userAgent: changeDetails.userAgent,
        supportEmail: process.env.SUPPORT_EMAIL
      }
    })
  }
}
```

## 🔧 Configuration

### Environment Variables
```bash
# Email Provider (currently supports: smtp)
EMAIL_PROVIDER=smtp

# App Configuration
APP_NAME=Your App Name
FRONTEND_URL=https://yourapp.com
SUPPORT_EMAIL=support@yourapp.com

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourapp.com
```

### NestJS Configuration Service
Ensure your `ConfigService` includes:
```typescript
export class ConfigService {
  mailerConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }
}
```

## 📧 Available Templates

### Authentication Templates
| Template ID | Purpose | Required Variables | Optional Variables |
|-------------|---------|-------------------|-------------------|
| `email-verification` | New account email verification | `userName`, `verificationUrl`, `appName` | `companyName`, `supportEmail`, `expirationHours` |
| `password-reset` | Password reset requests | `userName`, `resetUrl`, `appName` | `companyName`, `supportEmail`, `expirationMinutes` |
| `password-changed` | Security notification | `userName`, `appName`, `changeTime` | `companyName`, `supportEmail`, `loginUrl`, `ipAddress`, `userAgent` |
| `welcome` | Post-verification welcome | `userName`, `appName` | `companyName`, `supportEmail`, `dashboardUrl`, `gettingStartedUrl`, `documentationUrl` |

### Template Features
- ✅ Professional responsive HTML design
- ✅ Plain text fallbacks
- ✅ Security-focused messaging
- ✅ Accessible design patterns
- ✅ Multi-language ready structure

## 🎨 Handlebars Helpers

Built-in helpers available in all templates:
```handlebars
{{formatDate someDate}} <!-- Formats date/time -->
{{formatDate someDate "short"}} <!-- Short date format -->
{{uppercase text}} <!-- UPPERCASE TEXT -->
{{lowercase text}} <!-- lowercase text -->
{{#if (eq value1 value2)}}Equal{{/if}} <!-- Equality check -->
{{#if (ne value1 value2)}}Not equal{{/if}} <!-- Not equal check -->
{{#if (or condition1 condition2)}}True{{/if}} <!-- Logical OR -->
```

## 🔨 Advanced Usage

### Direct Template Manager Usage
```typescript
import { HandlebarsTemplateManager } from '@nestled-template/api/integrations'

@Injectable()
export class CustomEmailService {
  constructor(private readonly templateManager: HandlebarsTemplateManager) {}

  async getRenderedTemplate(templateId: string, variables: Record<string, any>) {
    const rendered = await this.templateManager.renderTemplate(templateId, variables)
    return rendered // { subject: string, html: string, text?: string }
  }

  async validateTemplate(templateId: string) {
    try {
      const template = await this.templateManager.getTemplate(templateId)
      console.log('Required variables:', template.requiredVariables)
      console.log('Optional variables:', template.optionalVariables)
      return true
    } catch (error) {
      console.error('Template not found:', error.message)
      return false
    }
  }
}
```

### Error Handling
```typescript
try {
  await this.emailService.sendTemplate(email, {
    templateId: 'email-verification',
    variables: { userName: 'John' } // Missing required variables
  })
} catch (error) {
  if (error.message.includes('Missing required template variables')) {
    // Handle missing variables
    console.log('Required variables missing')
  } else if (error.message.includes('Template') && error.message.includes('not found')) {
    // Handle template not found
    console.log('Template does not exist')
  } else {
    // Handle email sending errors
    console.log('Email delivery failed')
  }
}
```

## 🏗️ Extending the System

### Adding New Templates
1. Create template definition: `templates/{template-id}.json`
2. Create HTML template: `templates/{template-id}.html`
3. Create text template: `templates/{template-id}.txt` (optional)

Example template definition:
```json
{
  "id": "new-template",
  "name": "New Template",
  "description": "Description of the template",
  "subject": "Subject with {{variables}}",
  "requiredVariables": ["userName", "actionUrl"],
  "optionalVariables": ["companyName", "supportEmail"]
}
```

### Adding New Providers
```typescript
import { EmailProvider } from '@nestled-template/api/integrations'

export class NewEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<EmailResult> {
    // Implement email sending
  }
  
  async sendTemplate(to: string | string[], template: EmailTemplate, options?: Partial<EmailOptions>): Promise<EmailResult> {
    // Implement template sending (use HandlebarsTemplateManager)
  }
  
  async validateConnection(): Promise<boolean> {
    // Implement connection validation
  }
}
```

## 🔍 Testing Templates

You can test templates in development:
```typescript
// Clear template cache during development
templateManager.clearCache('template-id')

// Or clear all caches
templateManager.clearCache()
```

## 📝 AI Assistant Notes

When working with this email system:
- Always check template variable requirements in the `.json` files
- Use the authentication flow examples above as patterns for new implementations
- Template IDs correspond to filenames in the `templates/` directory
- The system auto-loads HTML and text templates based on template ID
- Error messages are descriptive - use them to debug template and variable issues
- Templates are cached after first load for performance
- All templates include security best practices and professional styling