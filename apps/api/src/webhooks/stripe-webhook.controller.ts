import { Controller, Post, Req, Res, HttpStatus, Logger, RawBodyRequest } from '@nestjs/common'
import { Request, Response } from 'express'
import { StripeService } from '@nestled-template/api/integrations'
import { WebhookService } from '@nestled-template/api/custom'

/**
 * Stripe Webhook Controller
 *
 * Handles incoming webhook events from Stripe.
 * This is a REST endpoint, not GraphQL.
 *
 * IMPORTANT: This endpoint requires raw body parsing for signature verification.
 * See app.module.ts for middleware configuration.
 */
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  constructor(
    private readonly stripe: StripeService,
    private readonly webhookService: WebhookService,
  ) {}

  @Post('stripe')
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ): Promise<Response> {
    const signature = request.headers['stripe-signature']

    if (!signature) {
      this.logger.error('Missing stripe-signature header')
      return response.status(HttpStatus.BAD_REQUEST).send('Missing signature')
    }

    // Get raw body for signature verification
    const rawBody = request.rawBody
    if (!rawBody) {
      this.logger.error('Missing raw body for signature verification')
      return response.status(HttpStatus.BAD_REQUEST).send('Missing raw body')
    }

    try {
      // Verify webhook signature and construct event
      const event = this.stripe.constructWebhookEvent(rawBody, signature as string)

      this.logger.log(`Received webhook event: ${event.type} (${event.id})`)

      // Process the event asynchronously (don't block Stripe's webhook call)
      this.webhookService.handleWebhookEvent(event).catch(error => {
        this.logger.error(`Error processing webhook event ${event.id}: ${error.message}`)
      })

      // Return 200 immediately to acknowledge receipt
      return response.status(HttpStatus.OK).json({ received: true })
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`)
      return response.status(HttpStatus.BAD_REQUEST).send(`Webhook Error: ${error.message}`)
    }
  }
}
