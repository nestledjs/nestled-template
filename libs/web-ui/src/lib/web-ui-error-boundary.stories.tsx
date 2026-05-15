import type { Meta, StoryObj } from '@storybook/react-vite'
import { WebUiErrorBoundary } from './web-ui-error-boundary'

const meta = {
  component: WebUiErrorBoundary,
  title: 'WebUi/WebUiErrorBoundary',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Comprehensive error boundary component that handles all error types: Vite cache errors, network/API errors, and generic errors.',
      },
    },
  },
} satisfies Meta<typeof WebUiErrorBoundary>

export default meta
type Story = StoryObj<typeof meta>

// Generic error (will show the WebErrorBoundaryUi)
export const GenericError: Story = {
  args: {
    error: new Error('Something went wrong with the application'),
  },
}

// Network error (will show WebUiServiceUnavailable)
export const NetworkError: Story = {
  args: {
    error: Object.assign(new Error('Failed to fetch'), {
      name: 'NetworkError',
    }),
  },
}

// Apollo error (will show WebUiServiceUnavailable)
export const ApolloError: Story = {
  args: {
    error: Object.assign(new Error('ApolloError: Query failed'), {
      name: 'ApolloError',
    }),
  },
}

// Vite cache error (will show WebUiViteCacheError)
export const ViteCacheError: Story = {
  args: {
    error: Object.assign(new Error('Cannot read properties of null (reading \'useContext\')'), {
      stack: 'Error: Cannot read properties of null (reading \'useContext\')\n    at useContext (/@fs/path/to/node_modules/.vite/deps/chunk-ABC123.js:123:45)',
    }),
  },
}

// With custom autoRefresh settings
export const ViteCacheErrorCustomRefresh: Story = {
  args: {
    error: Object.assign(new Error('Cannot read properties of null (reading \'useContext\')'), {
      stack: 'Error: Cannot read properties of null (reading \'useContext\')\n    at useContext (/@fs/path/to/node_modules/.vite/deps/chunk-ABC123.js:123:45)',
    }),
    autoRefresh: false, // Disable auto refresh for story
  },
}

// With header
export const WithHeader: Story = {
  args: {
    error: new Error('Something went wrong with the application'),
    header: (
      <div className="bg-blue-600 text-white p-4">
        <h1 className="text-xl font-bold">My App Header</h1>
      </div>
    ),
  },
} 