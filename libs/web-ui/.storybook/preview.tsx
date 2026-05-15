import '../../shared/styles/src/lib/app.css'
import { MemoryRouter } from 'react-router'
import type { Preview } from '@storybook/react-vite'
import { ComponentType } from 'react'

const preview: Preview = {
  decorators: [
    (Story: ComponentType) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],

  parameters: {
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
}

export default preview
