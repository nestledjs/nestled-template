import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite'
import { WebUiComingSoon } from './web-ui-coming-soon'
import { expect, within } from 'storybook/test'

const meta = {
  component: WebUiComingSoon,
  title: 'WebUi/ComingSoon',
  tags: ['autodocs'],
  args: {},
} satisfies Meta<typeof WebUiComingSoon>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Coming Soon')).toBeInTheDocument()
  },
}

export const NotFullScreen: Story = {
  args: { fullScreen: false },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Coming Soon')).toBeInTheDocument()
  },
}
