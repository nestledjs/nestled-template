/**
 * By default, React Router will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx react-router reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryclienttsx
 */
import { HydratedRouter } from 'react-router/dom'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { makeClient } from '@nestled-template/shared/apollo'
import { ApolloProvider } from '@apollo/client/react'
import { ApolloSearchProvider } from '@nestledjs/forms/apollo'
import { disableFragmentWarnings } from 'graphql-tag'

disableFragmentWarnings()

startTransition(() => {
  const client = makeClient(undefined, {
    apiUrl: `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/graphql`,
  })
  hydrateRoot(
    document,
    <StrictMode>
      <ApolloProvider client={client}>
        <ApolloSearchProvider>
          <HydratedRouter />
        </ApolloSearchProvider>
      </ApolloProvider>
    </StrictMode>,
  )
})
