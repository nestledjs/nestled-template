import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BlogAddOnPage from '../../../app/routes/_public/blog'
import { createTestRouter } from '../../helpers/createTestRouter'

describe('Blog add-on page', () => {
  const renderBlogPage = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/blog',
        Component: BlogAddOnPage,
      },
      {
        path: '/',
        Component: () => <div>Home</div>,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/blog']} />)
  }

  it('explains that blog publishing is an optional add-on', () => {
    renderBlogPage()

    expect(
      screen.getByRole('heading', { name: /Blog publishing is available as an add-on/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/How add-ons work/i)).toBeInTheDocument()
  })

  it('links to the hosted Blog Publishing add-on spec', () => {
    renderBlogPage()

    expect(screen.getByRole('link', { name: /Open the Blog add-on spec/i })).toHaveAttribute(
      'href',
      'https://nestledjs.com/docs/blog',
    )
  })
})
