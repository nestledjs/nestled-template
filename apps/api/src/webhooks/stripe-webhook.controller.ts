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

    // Step 1: verify the signature and construct the event. A failure here is a client/config
    // error (bad signature or secret) — return 400 so Stripe does NOT retry.
    let event: Awaited<ReturnType<StripeService['constructWebhookEvent']>>
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature as string)
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`)
      return response.status(HttpStatus.BAD_REQUEST).send(`Webhook Error: ${error.message}`)
    }

    this.logger.log(`Received webhook event: ${event.type} (${event.id})`)

    // Step 2: AWAIT the handler. Do NOT ack before processing — the previous fire-and-forget
    // returned 200 immediately, so a transient handler failure (DB error, pool exhaustion) was
    // swallowed and Stripe, having received 2xx, never retried. A paying customer would then never
    // get access, silently. Returning 500 on failure lets Stripe's retry schedule recover.
    // (Handlers are idempotent — keyed by Stripe IDs — so retries are safe.)
    try {
      await this.webhookService.handleWebhookEvent(event)
      return response.status(HttpStatus.OK).json({ received: true })
    } catch (error) {
      this.logger.error(`Error processing webhook event ${event.id}: ${error.message}`)
      return response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send(`Webhook processing error: ${error.message}`)
    }
  }
}
