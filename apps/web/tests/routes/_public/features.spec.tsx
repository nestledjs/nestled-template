import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FeaturesRouteGuidePage from '../../../app/routes/_public/features'
import { createTestRouter } from '../../helpers/createTestRouter'

describe('Features route guide page', () => {
  const renderFeaturesPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/features',
        Component: FeaturesRouteGuidePage,
      },
      {
        path: '/blog',
        Component: () => <div>Blog add-on page</div>,
      },
      {
        path: '/',
        Component: () => <div>Home</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/features']} />)
  }

  it('explains explicit route registration', () => {
    renderFeaturesPage()

    expect(
      screen.getByRole('heading', {
        name: /Features is a placeholder route you can replace or remove/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('apps/web/app/routes.tsx')).toBeInTheDocument()
    expect(screen.getByText(/React Router routes are not file-discovered/i)).toBeInTheDocument()
  })

  it('links to the blog add-ons example and home page', () => {
    renderFeaturesPage()

    expect(screen.getByRole('link', { name: /See add-ons example/i })).toHaveAttribute(
      'href',
      '/blog',
    )
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/')
  })
})
