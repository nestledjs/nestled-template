import { ApolloServer } from '@apollo/server'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { graphqlErrorOptions, includeGraphqlStacktrace } from './graphql-error-options'

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      broken: {
        type: GraphQLString,
        resolve: () => {
          throw new Error('database unavailable')
        },
      },
    },
  }),
})

/** `extensions.stacktrace` of a resolver error, from a real ApolloServer under `nodeEnv`. */
async function stacktraceUnder(
  nodeEnv: string,
  options: Partial<ReturnType<typeof graphqlErrorOptions>>,
): Promise<unknown> {
  const original = process.env['NODE_ENV']
  process.env['NODE_ENV'] = nodeEnv
  try {
    const server = new ApolloServer({ schema, ...options })
    const response = await server.executeOperation({ query: '{ broken }' })
    if (response.body.kind !== 'single') throw new Error('expected a single result')
    return response.body.singleResult.errors?.[0]?.extensions?.['stacktrace']
  } finally {
    process.env['NODE_ENV'] = original
  }
}

describe('GraphQL error stack traces', () => {
  // The control: Apollo's own default sends stack traces on any NODE_ENV but production and test.
  // A staging environment running NODE_ENV=stage leaked them to every client.
  it('Apollo sends them on a non-production NODE_ENV when the option is left out', async () => {
    await expect(stacktraceUnder('stage', {})).resolves.toEqual(expect.any(Array))
  })

  it('does not send them on NODE_ENV=stage', async () => {
    const options = graphqlErrorOptions({ NODE_ENV: 'stage' })

    await expect(stacktraceUnder('stage', options)).resolves.toBeUndefined()
  })

  it('ignores GRAPHQL_INCLUDE_STACKTRACE on a deployed NODE_ENV', async () => {
    for (const nodeEnv of ['stage', 'staging', 'production']) {
      const options = graphqlErrorOptions({ NODE_ENV: nodeEnv, GRAPHQL_INCLUDE_STACKTRACE: 'true' })

      await expect(stacktraceUnder(nodeEnv, options)).resolves.toBeUndefined()
    }
  })

  it('does not send them in development unless asked to', async () => {
    const options = graphqlErrorOptions({ NODE_ENV: 'development' })

    await expect(stacktraceUnder('development', options)).resolves.toBeUndefined()
  })

  it('sends them in development with GRAPHQL_INCLUDE_STACKTRACE=true', async () => {
    const options = graphqlErrorOptions({
      NODE_ENV: 'development',
      GRAPHQL_INCLUDE_STACKTRACE: 'true',
    })

    await expect(stacktraceUnder('development', options)).resolves.toEqual(expect.any(Array))
  })

  it('needs exactly "true"', () => {
    expect(
      includeGraphqlStacktrace({ NODE_ENV: 'development', GRAPHQL_INCLUDE_STACKTRACE: '1' }),
    ).toBe(false)
    expect(includeGraphqlStacktrace({})).toBe(false)
  })
})
