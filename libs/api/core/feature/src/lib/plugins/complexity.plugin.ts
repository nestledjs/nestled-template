import { GraphQLSchemaHost } from '@nestjs/graphql'
import { Plugin } from '@nestjs/apollo'
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server'
import { GraphQLError } from 'graphql'
import { fieldExtensionsEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity'
import { Logger } from '@nestjs/common'

@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private gqlSchemaHost: GraphQLSchemaHost) {}

  async requestDidStart(): Promise<void | GraphQLRequestListener<any>> {
    const maxComplexity = process.env['QUERY_COMPLEXITY_LIMIT']
      ? parseInt(process.env['QUERY_COMPLEXITY_LIMIT'])
      : 15000
    const logQueryComplexity = process.env['LOG_QUERY_COMPLEXITY']
      ? process.env['LOG_QUERY_COMPLEXITY'] === 'true'
      : false
    const logQueryComplexityThreshold = process.env['LOG_QUERY_COMPLEXITY_THRESHOLD']
      ? parseInt(process.env['LOG_QUERY_COMPLEXITY_THRESHOLD'])
      : 5000
    const queryComplexityVerboseErrors = process.env['QUERY_COMPLEXITY_VERBOSE_ERRORS']
      ? process.env['QUERY_COMPLEXITY_VERBOSE_ERRORS'] === 'true'
      : false

    const { schema } = this.gqlSchemaHost

    return {
      didResolveOperation: async ({ request, document }): Promise<void> => {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
        })

        if (logQueryComplexity && complexity > logQueryComplexityThreshold) {
          Logger.log(`Query Complexity for "${request.operationName}": ${complexity}`)
        }

        if (complexity > maxComplexity) {
          let message = `Query "${request.operationName}" is too complex: ${complexity}. Maximum allowed complexity: ${maxComplexity}.`
          if (queryComplexityVerboseErrors) {
            message = `${message}\n\nVariables:\n${JSON.stringify(
              request.variables,
            )}\n\nFull Query:\n${request.query}`
          }
          Logger.error(message)
          throw new GraphQLError(message)
        }

        return Promise.resolve()
      },
    }
  }
}
