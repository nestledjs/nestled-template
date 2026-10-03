import { Test, TestingModule } from '@nestjs/testing'
import { ContactMailerService, ContactFormData } from './contact-mailer.service'
import { EmailService } from '@nestled-template/api/integrations'
describe('ContactMailerService', () => {
  let service: ContactMailerService
  let mockEmailService: jest.Mocked<EmailService>
  beforeEach(async () => {
    mockEmailService = {
      send: jest.fn().mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['test@example.com'],
        rejected: [],
        response: '250 OK',
      }),
    } as any
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactMailerService,
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile()
    service = module.get<ContactMailerService>(ContactMailerService)
  })
  describe('sendContactFormNotification', () => {
    it('should send notification to all admin emails', async () => {
      const formData: ContactFormData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        questions: 'I am interested in joining nestled-template',
      }
      await service.sendContactFormNotification(formData)
      // One placeholder recipient. Real recipients belong in APP_ADMIN_EMAILS per deployment —
      // addresses hardcoded here get mangled by clone-identity in every clone.
      expect(mockEmailService.send).toHaveBeenCalledTimes(1)
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@test.com',
          subject: 'New Contact Form Submission - John Doe',
        }),
      )
    })
    it('should include contact details in email content', async () => {
      const formData: ContactFormData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        phone: '555-5678',
        questions: 'Can you tell me more about the networking events?',
      }
      await service.sendContactFormNotification(formData)
      const firstCall = mockEmailService.send.mock.calls[0][0]
      expect(firstCall.html).toContain('Jane Smith')
      expect(firstCall.html).toContain('jane@example.com')
      expect(firstCall.html).toContain('555-5678')
      expect(firstCall.html).toContain('Can you tell me more about the networking events?')
      expect(firstCall.text).toContain('Jane Smith')
      expect(firstCall.text).toContain('jane@example.com')
      expect(firstCall.text).toContain('555-5678')
    })
    it('should include chapter information when provided', async () => {
      const formData: ContactFormData = {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob@example.com',
        phone: '555-9999',
        questions: 'I want to join',
        chapterName: 'Downtown Chapter',
        chapterLocation: 'Los Angeles',
      }
      await service.sendContactFormNotification(formData)
      const firstCall = mockEmailService.send.mock.calls[0][0]
      expect(firstCall.html).toContain('Downtown Chapter')
      expect(firstCall.html).toContain('Los Angeles')
      expect(firstCall.text).toContain('Downtown Chapter')
      expect(firstCall.text).toContain('Los Angeles')
    })
    it('should not include chapter fields when not provided', async () => {
      const formData: ContactFormData = {
        firstName: 'Alice',
        lastName: 'Williams',
        email: 'alice@example.com',
        phone: '555-0000',
        questions: 'General inquiry',
      }
      await service.sendContactFormNotification(formData)
      const firstCall = mockEmailService.send.mock.calls[0][0]
      expect(firstCall.html).not.toContain('<p><strong>Chapter:</strong>')
      expect(firstCall.html).not.toContain('<p><strong>Location:</strong>')
    })
    it('should throw error if email sending fails', async () => {
      const formData: ContactFormData = {
        firstName: 'Error',
        lastName: 'Test',
        email: 'error@example.com',
        phone: '555-0001',
        questions: 'Test error handling',
      }
      mockEmailService.send.mockRejectedValue(new Error('SMTP connection failed'))
      await expect(service.sendContactFormNotification(formData)).rejects.toThrow(
        'SMTP connection failed',
      )
    })
    it('should send emails in parallel for better performance', async () => {
      const formData: ContactFormData = {
        firstName: 'Performance',
        lastName: 'Test',
        email: 'perf@example.com',
        phone: '555-0002',
        questions: 'Testing parallel sending',
      }
      // Drive several recipients so this actually exercises the parallel-send contract. The
      // default list is a single placeholder, against which a timing assertion would pass even if
      // sends were sequential — i.e. it would prove nothing.
      const recipients = ['a@test.com', 'b@test.com', 'c@test.com', 'd@test.com']
      ;(service as unknown as { adminEmails: string[] }).adminEmails = recipients
      mockEmailService.send.mockImplementation(async () => {
        // Simulate 100ms send time
        await new Promise(resolve => setTimeout(resolve, 100))
        return {
          messageId: 'test-message-id',
          accepted: ['test@example.com'],
          rejected: [],
          response: '250 OK',
        }
      })
      const startTime = Date.now()
      await service.sendContactFormNotification(formData)
      const totalTime = Date.now() - startTime
      // If sent in parallel, total time should be ~100ms, not 400ms (4 emails × 100ms)
      expect(totalTime).toBeLessThan(300)
      expect(mockEmailService.send).toHaveBeenCalledTimes(recipients.length)
    })
  })
  describe('sendGuestConfirmationEmail', () => {
    it('should send confirmation email to guest', async () => {
      const formData: ContactFormData = {
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah@example.com',
        phone: '555-7777',
        questions: 'Interested in membership',
      }
      await service.sendGuestConfirmationEmail(formData)
      expect(mockEmailService.send).toHaveBeenCalledTimes(1)
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'sarah@example.com',
          subject: 'Thank you for your interest in nestled-template!',
        }),
      )
    })
    it('should include first name in greeting', async () => {
      const formData: ContactFormData = {
        firstName: 'Michael',
        lastName: 'Chen',
        email: 'michael@example.com',
        phone: '555-8888',
        questions: 'Tell me more',
      }
      await service.sendGuestConfirmationEmail(formData)
      const call = mockEmailService.send.mock.calls[0][0]
      expect(call.html).toContain('Dear Michael')
      expect(call.text).toContain('Dear Michael')
    })
    it('should include chapter information when provided', async () => {
      const formData: ContactFormData = {
        firstName: 'Emily',
        lastName: 'Brown',
        email: 'emily@example.com',
        phone: '555-3333',
        questions: 'Chapter inquiry',
        chapterName: 'Westside Chapter',
        chapterLocation: 'Santa Monica',
      }
      await service.sendGuestConfirmationEmail(formData)
      const call = mockEmailService.send.mock.calls[0][0]
      expect(call.html).toContain('Westside Chapter')
      expect(call.html).toContain('Santa Monica')
      expect(call.text).toContain('Westside Chapter')
      expect(call.text).toContain('Santa Monica')
    })
    it('should not mention chapter when not provided', async () => {
      const formData: ContactFormData = {
        firstName: 'David',
        lastName: 'Lee',
        email: 'david@example.com',
        phone: '555-4444',
        questions: 'General question',
      }
      await service.sendGuestConfirmationEmail(formData)
      const call = mockEmailService.send.mock.calls[0][0]
      expect(call.html).not.toContain('chapter')
      expect(call.text).not.toContain('chapter')
    })
    it('should include automated response disclaimer', async () => {
      const formData: ContactFormData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '555-0000',
        questions: 'Test',
      }
      await service.sendGuestConfirmationEmail(formData)
      const call = mockEmailService.send.mock.calls[0][0]
      expect(call.html).toContain('automated response')
      expect(call.html).toContain('do not reply')
      expect(call.text).toContain('automated response')
    })
    it('should throw error if email sending fails', async () => {
      const formData: ContactFormData = {
        firstName: 'Error',
        lastName: 'Handler',
        email: 'error@example.com',
        phone: '555-0003',
        questions: 'Test error',
      }
      mockEmailService.send.mockRejectedValue(new Error('Invalid email address'))
      await expect(service.sendGuestConfirmationEmail(formData)).rejects.toThrow(
        'Invalid email address',
      )
    })
    it('should include both HTML and plain text versions', async () => {
      const formData: ContactFormData = {
        firstName: 'Format',
        lastName: 'Test',
        email: 'format@example.com',
        phone: '555-0004',
        questions: 'Testing formats',
      }
      await service.sendGuestConfirmationEmail(formData)
      const call = mockEmailService.send.mock.calls[0][0]
      expect(call.html).toBeDefined()
      expect(call.text).toBeDefined()
      expect(call.html).toContain('<h2>')
      expect(call.text).not.toContain('<h2>')
    })
  })
  describe('Error Handling', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      const formData: ContactFormData = {
        firstName: 'String',
        lastName: 'Error',
        email: 'string@example.com',
        phone: '555-0005',
        questions: 'Test string error',
      }
      // Simulate a string being thrown instead of Error object
      mockEmailService.send.mockRejectedValue('String error message')
      await expect(service.sendContactFormNotification(formData)).rejects.toBe(
        'String error message',
      )
    })
    it('should handle undefined errors gracefully', async () => {
      const formData: ContactFormData = {
        firstName: 'Undefined',
        lastName: 'Error',
        email: 'undefined@example.com',
        phone: '555-0006',
        questions: 'Test undefined error',
      }
      mockEmailService.send.mockRejectedValue(undefined)
      await expect(service.sendContactFormNotification(formData)).rejects.toBeUndefined()
    })
  })
})
