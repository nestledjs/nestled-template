import type { Meta, StoryObj, StoryContext } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { WebUiLoading } from './web-ui-loading'

const meta = {
  component: WebUiLoading,
  title: 'WebUi/Loading',
  tags: ['autodocs'],
} satisfies Meta<typeof WebUiLoading>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    // Wait for the loading dots to appear (after 1s delay)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(canvas.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  },
}

export const WithCustomClass: Story = {
  args: {
    className: 'bg-yellow-100',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(canvas.getByRole('status', { name: 'Loading' })).toHaveClass('bg-yellow-100')
  },
}
