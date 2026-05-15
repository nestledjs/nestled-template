import { Plugin } from '@nestjs/apollo'
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server'

/**
 * This is a general logging plugin that is a placeholder for future plugin use.
 */
@Plugin()
export class LoggingPlugin implements ApolloServerPlugin {
  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    console.log('Request started')
    return {
      async willSendResponse(): Promise<void> {
        console.log('Will send response')
      },
    }
  }
}
