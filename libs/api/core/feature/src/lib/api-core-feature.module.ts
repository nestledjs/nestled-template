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
import { graphqlErrorOptions } from './graphql-error-options'
import { ComplexityPlugin } from './plugins/complexity.plugin'
import { NoCachePlugin } from './plugins/no-cache.plugin'
import { authorizeWsConnection } from './ws-session-token'

interface ConnectionParameters {
  headers?: Record<string, string>
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
          // 4401 for a missing or unverifiable session, 1013 (try again later) for an internal
          // failure; see authorizeWsConnection.
          onConnect: (context: Context<Record<string, unknown> | undefined>) =>
            authorizeWsConnection(context.extra),
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
      // formatApiError, and stack traces only on a local opt-in (GRAPHQL_INCLUDE_STACKTRACE).
      ...graphqlErrorOptions(),
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
