import type { Meta, StoryObj, StoryContext } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { WebUiFooter } from './web-ui-footer'

const meta = {
  component: WebUiFooter,
  title: 'WebUi/Footer',
  tags: ['autodocs'],
} satisfies Meta<typeof WebUiFooter>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Your Company/)).toBeInTheDocument()
    await expect(canvas.getByText('Privacy Policy')).toBeInTheDocument()
  },
}
