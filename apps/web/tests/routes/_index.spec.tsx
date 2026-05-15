import React from 'react'
import { render } from '@testing-library/react'
import { createTestRouter } from "../helpers/createTestRouter"
import App from '../../app/app'

describe('App Component', () => {
  test('renders without crashing when no meQueryRef provided', () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/',
        Component: App,
        loader: () => ({ meQueryRef: null })
      },
    ])

    expect(() => render(<ReactRouterStub />)).not.toThrow()
  })

  test('renders without crashing when meQueryRef is undefined', () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/',
        Component: App,
        loader: () => ({})
      },
    ])

    expect(() => render(<ReactRouterStub />)).not.toThrow()
  })
})
