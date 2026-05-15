import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite'
import { WebUiAvatar } from './web-ui-avatar'
import { expect, within } from 'storybook/test'

const meta = {
  component: WebUiAvatar,
  title: 'WebUi/Avatar',
  tags: ['autodocs'],
  args: {
    name: 'Jane Doe',
  },
} satisfies Meta<typeof WebUiAvatar>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'initials',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('JD')).toBeInTheDocument()
  },
}

export const WithImage: Story = {
  args: {
    src: 'https://randomuser.me/api/portraits/women/44.jpg',
    name: 'Jane Doe',
  },
}

export const Notification: Story = {
  args: {
    notification: true,
    notificationColor: 'bg-green-500',
    notificationPosition: 'top',
  },
}

export const Square: Story = {
  args: {
    shape: 'square',
  },
}

export const Rounded: Story = {
  args: {
    shape: 'rounded',
  },
}

export const Large: Story = {
  args: {
    size: 'xl',
  },
}

export const PlaceholderIcon: Story = {
  args: {
    placeholder: 'icon',
  },
}
