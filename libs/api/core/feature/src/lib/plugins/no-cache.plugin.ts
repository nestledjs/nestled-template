import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server'
import { Plugin } from '@nestjs/apollo'
import { Injectable } from '@nestjs/common'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  Expires: '0',
} as const

/**
 * Apollo Server plugin to add no-cache headers to all GraphQL responses.
 * Prevents CDNs, proxies, and browsers from caching GraphQL responses
 * which could lead to stale user data.
 *
 * Configurable via GRAPHQL_NO_CACHE_HEADERS environment variable (defaults to true).
 */
@Injectable()
@Plugin()
export class NoCachePlugin implements ApolloServerPlugin {
  private readonly enabled: boolean

  constructor() {
    this.enabled = process.env['GRAPHQL_NO_CACHE_HEADERS'] !== 'false'
  }

  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    const enabled = this.enabled

    return {
      async willSendResponse(requestContext) {
        if (!enabled) {
          return
        }

        const { response, contextValue } = requestContext

        // Set headers via Express response object
        if (contextValue?.res) {
          const res = contextValue.res
          for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
            res.setHeader(key, value)
          }
        }

        // Apollo Server 4+ response headers
        if (response?.http?.headers) {
          for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
            response.http.headers.set(key, value)
          }
        }
      },
    }
  }
}
