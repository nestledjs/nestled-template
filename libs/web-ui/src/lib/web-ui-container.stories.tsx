import type { Meta, StoryObj, StoryContext } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { WebUiContainer } from './web-ui-container'

const meta = {
  component: WebUiContainer,
  title: 'WebUi/Container',
  tags: ['autodocs'],
  args: {
    children: 'This is a container',
  },
} satisfies Meta<typeof WebUiContainer>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithBlur: Story = {
  args: {
    blur: 'top-right',
    children: 'Container with blur effect',
  },
}

export const Centered: Story = {
  args: {
    center: true,
    children: 'Centered content',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    // Check that the content is present
    const textElement = canvas.getByText('Centered content')
    await expect(textElement).toBeInTheDocument()
    // The text is inside the inner container div which has the centering class
    await expect(textElement.className).toMatch(/items-center/)
  },
}
