import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite'
import { WebUiButton } from './web-ui-button'
import { expect, within } from 'storybook/test'
import { FaArrowRight } from 'react-icons/fa'

const meta = {
  component: WebUiButton,
  title: 'WebUi/Button',
  tags: ['autodocs'],
  args: {
    children: 'Button',
  },
} satisfies Meta<typeof WebUiButton>
export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { buttonType: 'Primary' },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Button')).toBeInTheDocument()
  },
}

export const Secondary: Story = {
  args: { buttonType: 'Secondary' },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const WithIcon: Story = {
  args: { icon: <FaArrowRight />, iconLocation: 'right' },
}

export const AsLink: Story = {
  args: { linkTo: '/about', children: 'Go to About' },
}
