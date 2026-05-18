import { Logger } from '@nestjs/common'
import { RedisPubSub } from 'graphql-redis-subscriptions'
import { PubSub } from 'graphql-subscriptions'
import Redis from 'ioredis'

// Railway provides REDIS_URL (private) and REDIS_PASSWORD separately
// REDIS_PUBLIC_URL is for external access, REDIS_URL is internal
const REDIS_URL =
  process.env['REDIS_URL'] ?? process.env['REDIS_PRIVATE_URL'] ?? process.env['REDIS_TLS_URL'] ?? ''
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'] ?? ''

// Check if we have a valid Redis URL to connect to
const hasValidRedisUrl = REDIS_URL && !REDIS_URL.includes('localhost') && REDIS_URL.length > 10

const secure = REDIS_URL ? /rediss:/.test(REDIS_URL) : false

if (hasValidRedisUrl) {
  Logger.log(
    `🔴 Redis: Connecting to ${REDIS_URL.replace(/:[^:@]+@/, ':****@')} (password: ${
      REDIS_PASSWORD ? 'provided' : 'none'
    })`,
  )
} else {
  Logger.warn(
    '🔴 Redis: No valid URL provided. Using in-memory PubSub (subscriptions will not work across instances).',
  )
}

const dateReviver = (_key: unknown, value: string | Date): Date => {
  const isISO8601Z = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/
  if (typeof value === 'string' && isISO8601Z.test(value)) {
    const tempDateNumber = Date.parse(value)
    if (!Number.isNaN(tempDateNumber)) {
      return new Date(tempDateNumber)
    }
  }
  if (typeof value !== 'string') return value
  return new Date(value)
}

function createRedisPubSub(): RedisPubSub | PubSub {
  if (!hasValidRedisUrl) {
    // Fall back to in-memory PubSub when Redis is not available
    return new PubSub()
  }

  const options = {
    // Add password if provided separately (Railway sometimes does this)
    ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
    // TLS settings for secure connections
    ...(secure && {
      tls: {
        rejectUnauthorized: false,
      },
    }),
    // Force IPv6 for Railway private networking
    family: 6,
    // Retry strategy to handle temporary connection issues
    retryStrategy: (times: number) => {
      if (times > 3) {
        Logger.error(`🔴 Redis: Failed to connect after ${times} attempts. Giving up.`)
        return null // Stop retrying
      }
      const delay = Math.min(times * 1000, 3000)
      Logger.warn(`🔴 Redis: Connection attempt ${times} failed. Retrying in ${delay}ms...`)
      return delay
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true, // Don't connect immediately, wait for first command
  }

  try {
    const publisher = new Redis(REDIS_URL, options)
    const subscriber = new Redis(REDIS_URL, options)

    // Handle connection errors gracefully
    publisher.on('error', err => {
      Logger.error(`🔴 Redis publisher error: ${err.message}`)
    })
    subscriber.on('error', err => {
      Logger.error(`🔴 Redis subscriber error: ${err.message}`)
    })
    publisher.on('connect', () => {
      Logger.log('🔴 Redis publisher connected')
    })
    subscriber.on('connect', () => {
      Logger.log('🔴 Redis subscriber connected')
    })

    return new RedisPubSub({
      publisher,
      subscriber,
      reviver: dateReviver,
    })
  } catch (error) {
    Logger.error(`🔴 Redis: Failed to create PubSub: ${error}`)
    Logger.warn('🔴 Redis: Falling back to in-memory PubSub')
    return new PubSub()
  }
}

export const apiCorePubSub = createRedisPubSub()
