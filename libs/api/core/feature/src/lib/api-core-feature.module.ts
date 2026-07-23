import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { Module } from '@nestjs/common'
import { GraphQLModule } from '@nestjs/graphql'
import { join } from 'node:path'
import { Request, Response } from 'express'
import { apiCorePubSub } from '@nestled-template/api/core/data-access'
import { Context } from 'graphql-ws'
import { ApiCoreFeatureController } from './api-core-feature.controller'
import { ApiCoreFeatureResolver } from './api-core-feature.resolver'
import { ApiCoreFeatureService } from './api-core-feature.service'
import { ComplexityPlugin } from './plugins/complexity.plugin'
import { NoCachePlugin } from './plugins/no-cache.plugin'

interface ConnectionParameters {
  headers?: Record<string, string>
}

type WsContextExtra = {
  request?: {
    rawHeaders?: string[]
  }
}

function extractTokenFromWsContext(extra: unknown): string {
  if (
    extra &&
    typeof extra === 'object' &&
    'request' in extra &&
    extra.request &&
    typeof extra.request === 'object' &&
    'rawHeaders' in extra.request
  ) {
    const rawHeaders = (extra as WsContextExtra).request?.rawHeaders
    const cookieName = process.env['VITE_COOKIE_NAME'] || '__session'
    return rawHeaders ? extractTokenFromRawHeaders(rawHeaders, cookieName) : ''
  }
  return ''
}

function extractTokenFromRawHeaders(rawHeaders: string[], cookieName: string): string {
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() !== 'cookie') continue
    for (const cookie of rawHeaders[i + 1].split(';')) {
      const [name, value] = cookie.trim().split('=')
      if (name === cookieName) return value
    }
    break
  }
  return ''
}

const redisPubSubProvider = {
  provide: 'REDIS_PUB_SUB',
  useValue: apiCorePubSub,
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'api-schema.graphql'),
      csrfPrevention: {
        requestHeaders: ['apollo-require-preflight'],
      },
      subscriptions: {
        'graphql-ws': {
          onConnect: async (context: Context<Record<string, unknown> | undefined>) => {
            const { extra } = context
            const token = extractTokenFromWsContext(extra)
            if (token === '') {
              throw new Error('Authentication token is missing')
            }
            return true
          },
        },
      },
      context: ({
        req,
        res,
        connectionParams,
      }: {
        req: Partial<Request>
        res: Response
        connectionParams: ConnectionParameters
      }) => {
        if (connectionParams) {
          // Preserve existing req properties (user, organizationContext, etc.) while adding connection headers
          req = { ...req, headers: connectionParams.headers }
        }
        return { req, res }
      },
      sortSchema: true,
      buildSchemaOptions: {
        dateScalarMode: 'isoDate',
        numberScalarMode: 'float',
      },
    }),
  ],
  controllers: [ApiCoreFeatureController],
  providers: [
    ApiCoreFeatureResolver,
    ApiCoreFeatureService,
    ComplexityPlugin,
    NoCachePlugin,
    redisPubSubProvider,
  ],
  exports: [ApiCoreFeatureService, ComplexityPlugin, NoCachePlugin, 'REDIS_PUB_SUB'],
})
export class ApiCoreFeatureModule {}
