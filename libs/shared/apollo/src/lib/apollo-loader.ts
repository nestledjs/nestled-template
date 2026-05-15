import { createApolloLoaderHandler } from '@apollo/client-integration-react-router'
import { makeClient } from '@nestled-template/shared/apollo'

export const apolloLoader = createApolloLoaderHandler(req =>
  makeClient(req, {
    apiUrl: `${process.env.VITE_API_URL || 'http://localhost:3000'}/graphql`
  })
)
