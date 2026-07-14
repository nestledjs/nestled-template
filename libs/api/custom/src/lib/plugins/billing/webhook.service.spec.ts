import { Test, TestingModule } from '@nestjs/testing'
import { WebhookService } from './webhook.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SubscriptionStatus } from '@nestled-template/api/prisma'
describe('WebhookService', () => {
  let service: WebhookService
  let mockPrisma: any
  beforeEach(async () => {
    mockPrisma = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      usageRecord: {
        create: jest.fn(),
      },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockPrisma,
        },
      ],
    }).compile()
    service = module.get<WebhookService>(WebhookService)
  })
  describe('Event Handling', () => {
    it('should skip duplicate events', async () => {
      const mockEvent = {
        id: 'evt_duplicate_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_end: 1612137600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      // Process the same event twice
      await service.handleWebhookEvent(mockEvent)
      await service.handleWebhookEvent(mockEvent)
      // Should only be called once due to idempotency
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledTimes(1)
    })
    it('should throw error if event processing fails', async () => {
      const mockEvent = {
        id: 'evt_error_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_end: 1612137600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      // Simulate database error on the method that's actually called
      mockPrisma.subscription.updateMany.mockRejectedValue(new Error('Database error'))
      await expect(service.handleWebhookEvent(mockEvent)).rejects.toThrow('Database error')
    })
    it('should handle checkout.session.completed event', async () => {
      const mockEvent = {
        id: 'evt_checkout_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: {
              organizationId: 'org-123',
              planId: 'plan-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.findUnique.mockResolvedValue(null)
      // metadata.planId is now validated against a Plan row before it is used as an FK.
      mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-123' } as any)
      mockPrisma.subscription.upsert.mockResolvedValue({
        id: 'sub-123',
        organizationId: 'org-123',
        stripeCustomerId: 'cus_test_123',
        stripeSubscriptionId: 'sub_test_123',
      } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-123' },
          create: expect.objectContaining({
            organizationId: 'org-123',
            planId: 'plan-123',
            stripeCustomerId: 'cus_test_123',
            stripeSubscriptionId: 'sub_test_123',
          }),
          update: expect.objectContaining({
            stripeCustomerId: 'cus_test_123',
            stripeSubscriptionId: 'sub_test_123',
          }),
        }),
      )
    })
    it('should handle customer.subscription.updated event', async () => {
      const mockEvent = {
        id: 'evt_sub_update_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_start: 1609459200,
            current_period_end: 1612137600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_test_123' },
          data: expect.objectContaining({
            status: SubscriptionStatus.ACTIVE,
            stripePriceId: 'price_test_123',
          }),
        }),
      )
    })
    it('should handle customer.subscription.deleted event', async () => {
      const mockEvent = {
        id: 'evt_sub_delete_123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'canceled',
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_test_123' },
          data: expect.objectContaining({
            status: SubscriptionStatus.CANCELED,
            canceledAt: expect.any(Date),
          }),
        }),
      )
    })
    it('should log unhandled event types without throwing', async () => {
      const mockEvent = {
        id: 'evt_unhandled_123',
        type: 'some.unknown.event',
        data: {
          object: {},
        },
      } as any
      // Should not throw
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
  })
  describe('Event Memory Management', () => {
    it('should clean up old processed events when limit exceeded', async () => {
      const events: any[] = []
      // Create 10001 unique events
      for (let i = 0; i < 10001; i++) {
        events.push({
          id: `evt_test_${i}`,
          type: 'some.unknown.event',
          data: { object: {} },
        })
      }
      // Process all events
      for (const event of events) {
        await service.handleWebhookEvent(event)
      }
      // Process a duplicate of the first event
      // Should NOT skip because it was cleaned up from memory
      await expect(service.handleWebhookEvent(events[0])).resolves.toBeUndefined()
    })
  })
  describe('Edge Cases', () => {
    it('should handle missing metadata in checkout session', async () => {
      const mockEvent = {
        id: 'evt_no_metadata_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: {},
          },
        },
      } as any
      // Should log error but not throw
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle missing customer in checkout session', async () => {
      const mockEvent = {
        id: 'evt_no_customer_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      // Should log error but not throw
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('C25: does not write an empty planId when metadata lacks planId and no Plan resolves', async () => {
      const mockEvent = {
        id: 'evt_no_plan_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { organizationId: 'org-123' }, // no planId, no priceId
          },
        },
      } as any
      mockPrisma.subscription.findUnique.mockResolvedValue(null) // no existing subscription
      // Fails fast (logs) instead of upserting planId:'' which is a guaranteed FK (P2003) violation.
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
      expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled()
    })
    it('C25: resolves planId from the Stripe price id in metadata when planId is absent', async () => {
      const mockEvent = {
        id: 'evt_price_lookup_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { organizationId: 'org-123', priceId: 'price_test_123' },
          },
        },
      } as any
      mockPrisma.subscription.findUnique.mockResolvedValue(null)
      mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-from-price' } as any)
      mockPrisma.subscription.upsert.mockResolvedValue({} as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stripePriceId: 'price_test_123' } }),
      )
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ planId: 'plan-from-price' }),
        }),
      )
    })
    it('PIR-197: ignores a metadata.planId that matches no Plan row (no FK write)', async () => {
      const mockEvent = {
        id: 'evt_stale_plan_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            // Stale/typo'd planId, and no priceId fallback.
            metadata: { organizationId: 'org-123', planId: 'plan-does-not-exist' },
          },
        },
      } as any
      mockPrisma.subscription.findUnique.mockResolvedValue(null) // no existing subscription
      mockPrisma.plan.findUnique.mockResolvedValue(null) // planId matches no Plan row
      // Treated as unresolved (like the price-id fallback) — never passes the bad id to an FK write.
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan-does-not-exist' } }),
      )
      expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled()
    })
    it('PIR-197: falls back to the existing row planId on update when the webhook cannot re-resolve one', async () => {
      const mockEvent = {
        id: 'evt_update_no_plan_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { organizationId: 'org-123' }, // no planId, no priceId
          },
        },
      } as any
      // An existing subscription already carries a valid FK — never clobber it with null.
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        planId: 'plan-existing',
      } as any)
      mockPrisma.subscription.upsert.mockResolvedValue({} as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ planId: 'plan-existing' }),
        }),
      )
    })
    it('C25: does not upsert when the Stripe price id resolves no Plan row', async () => {
      const mockEvent = {
        id: 'evt_price_missing_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { organizationId: 'org-123', priceId: 'price_unknown' },
          },
        },
      } as any
      mockPrisma.subscription.findUnique.mockResolvedValue(null)
      mockPrisma.plan.findUnique.mockResolvedValue(null) // price matches no Plan row
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
      expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled()
    })
    it('should handle subscription with customer object instead of string', async () => {
      const mockEvent = {
        id: 'evt_customer_obj_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: {
              id: 'cus_test_123',
              email: 'customer@example.com',
            },
            status: 'active',
            current_period_end: 1612137600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalled()
    })
  })
  describe('Idempotency', () => {
    it('should be idempotent for the same event', async () => {
      const mockEvent = {
        id: 'evt_idempotent_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_end: 1612137600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_test_123',
                  },
                },
              ],
            },
            metadata: {
              organizationId: 'org-123',
            },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      // Process the same event multiple times
      await service.handleWebhookEvent(mockEvent)
      await service.handleWebhookEvent(mockEvent)
      await service.handleWebhookEvent(mockEvent)
      // Database should only be updated once due to idempotency
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledTimes(1)
    })
  })
  describe('Invoice Events', () => {
    it('should handle invoice.paid event', async () => {
      const mockEvent = {
        id: 'evt_invoice_paid_123',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_123',
            subscription: 'sub_test_123',
            period_end: 1614729600,
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_test_123' },
          data: expect.objectContaining({
            status: SubscriptionStatus.ACTIVE,
          }),
        }),
      )
    })
    it('should handle invoice.payment_succeeded event', async () => {
      const mockEvent = {
        id: 'evt_invoice_success_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_123',
            subscription: 'sub_test_123',
            period_end: 1614729600,
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalled()
    })
    it('should handle invoice.payment_failed event', async () => {
      const mockEvent = {
        id: 'evt_invoice_failed_123',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_123',
            subscription: 'sub_test_123',
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_test_123' },
          data: expect.objectContaining({
            status: SubscriptionStatus.PAST_DUE,
          }),
        }),
      )
    })
    it('should handle invoice.upcoming event', async () => {
      const mockEvent = {
        id: 'evt_invoice_upcoming_123',
        type: 'invoice.upcoming',
        data: {
          object: {
            id: 'in_test_123',
            subscription: 'sub_test_123',
          },
        },
      } as any
      // Should not throw and should process successfully
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle subscription object in invoice event', async () => {
      const mockEvent = {
        id: 'evt_invoice_obj_123',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_123',
            subscription: {
              id: 'sub_test_123',
            },
            period_end: 1614729600,
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_test_123' },
        }),
      )
    })
  })
  // Regressions for the modern (basil+) Stripe object shapes — the previous `as any` reads assumed
  // the legacy top-level fields and silently no-op'd on the new shape (C19 / P1).
  describe('Modern Stripe object shapes (basil+)', () => {
    it('C19: resolves the subscription id from invoice.parent on invoice.payment_failed', async () => {
      const mockEvent = {
        id: 'evt_invoice_failed_basil',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_basil_123',
            // NO top-level `subscription` field on basil+ invoices.
            parent: { subscription_details: { subscription: 'sub_basil_123' } },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_basil_123' },
          data: expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
        }),
      )
    })
    it('C19: resolves the subscription id from invoice.parent on invoice.paid', async () => {
      const mockEvent = {
        id: 'evt_invoice_paid_basil',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_basil_456',
            parent: { subscription_details: { subscription: 'sub_basil_456' } },
            period_end: 1614729600,
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_basil_456' },
          data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
        }),
      )
    })
    it('C19: resolves the subscription id from the per-line subscription_item_details on invoice.paid', async () => {
      const mockEvent = {
        id: 'evt_invoice_paid_line',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_line_123',
            // No top-level subscription and no invoice.parent — only the per-line detail carries it.
            lines: {
              data: [{ parent: { subscription_item_details: { subscription: 'sub_line_123' } } }],
            },
            period_end: 1614729600,
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_line_123' },
          data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
        }),
      )
    })
    it('P1: reads current_period_end from items.data[0] and never builds an Invalid Date', async () => {
      const mockEvent = {
        id: 'evt_sub_basil_period',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_basil_789',
            customer: 'cus_test_123',
            status: 'active',
            // NO top-level current_period_end — it lives on the item now.
            items: {
              data: [{ price: { id: 'price_test_123' }, current_period_end: 1612137600 }],
            },
            metadata: { organizationId: 'org-123' },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      const call = mockPrisma.subscription.updateMany.mock.calls[0][0]
      expect(call.data.stripeCurrentPeriodEnd).toEqual(new Date(1612137600 * 1000))
    })
    it('P1: leaves stripeCurrentPeriodEnd undefined (not Invalid Date) when period end is absent', async () => {
      const mockEvent = {
        id: 'evt_sub_no_period',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_no_period',
            customer: 'cus_test_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_test_123' } }] }, // no current_period_end anywhere
            metadata: { organizationId: 'org-123' },
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      const call = mockPrisma.subscription.updateMany.mock.calls[0][0]
      expect(call.data.stripeCurrentPeriodEnd).toBeUndefined()
    })
  })
  describe('Payment Intent Events', () => {
    it('should handle payment_intent.succeeded event', async () => {
      const mockEvent = {
        id: 'evt_payment_success_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 5000,
            currency: 'usd',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle payment_intent.payment_failed event', async () => {
      const mockEvent = {
        id: 'evt_payment_failed_123',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_123',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
  })
  describe('Charge Events', () => {
    it('should handle charge.succeeded event', async () => {
      const mockEvent = {
        id: 'evt_charge_success_123',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_test_123',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle charge.refunded event', async () => {
      const mockEvent = {
        id: 'evt_charge_refund_123',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_123',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
  })
  describe('Product/Price Events', () => {
    it('should handle product.created event', async () => {
      const mockEvent = {
        id: 'evt_product_create_123',
        type: 'product.created',
        data: {
          object: {
            id: 'prod_test_123',
            name: 'Premium Plan',
            description: 'Premium subscription',
            active: true,
          },
        },
      } as any
      mockPrisma.plan.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.plan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeProductId: 'prod_test_123' },
          data: expect.objectContaining({
            name: 'Premium Plan',
            description: 'Premium subscription',
            active: true,
          }),
        }),
      )
    })
    it('should handle product.updated event', async () => {
      const mockEvent = {
        id: 'evt_product_update_123',
        type: 'product.updated',
        data: {
          object: {
            id: 'prod_test_123',
            name: 'Updated Plan',
            active: false,
          },
        },
      } as any
      mockPrisma.plan.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.plan.updateMany).toHaveBeenCalled()
    })
    it('should handle price.created event', async () => {
      const mockEvent = {
        id: 'evt_price_create_123',
        type: 'price.created',
        data: {
          object: {
            id: 'price_test_123',
            active: true,
          },
        },
      } as any
      mockPrisma.plan.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.plan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripePriceId: 'price_test_123' },
          data: expect.objectContaining({
            active: true,
          }),
        }),
      )
    })
    it('should handle price.updated event', async () => {
      const mockEvent = {
        id: 'evt_price_update_123',
        type: 'price.updated',
        data: {
          object: {
            id: 'price_test_123',
            active: false,
          },
        },
      } as any
      mockPrisma.plan.updateMany.mockResolvedValue({ count: 1 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.plan.updateMany).toHaveBeenCalled()
    })
  })
  describe('Customer Events', () => {
    it('should handle customer.created event', async () => {
      const mockEvent = {
        id: 'evt_customer_create_123',
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test_123',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle customer.updated event', async () => {
      const mockEvent = {
        id: 'evt_customer_update_123',
        type: 'customer.updated',
        data: {
          object: {
            id: 'cus_test_123',
          },
        },
      } as any
      await expect(service.handleWebhookEvent(mockEvent)).resolves.toBeUndefined()
    })
    it('should handle customer.deleted event', async () => {
      const mockEvent = {
        id: 'evt_customer_delete_123',
        type: 'customer.deleted',
        data: {
          object: {
            id: 'cus_test_123',
          },
        },
      } as any
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 2 } as any)
      await service.handleWebhookEvent(mockEvent)
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeCustomerId: 'cus_test_123' },
          data: expect.objectContaining({
            status: SubscriptionStatus.CANCELED,
            canceledAt: expect.any(Date),
          }),
        }),
      )
    })
  })
})
