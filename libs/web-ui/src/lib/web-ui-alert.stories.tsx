import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite'
import { WebUiAlert } from './web-ui-alert'
import { expect, within } from 'storybook/test'

const meta = {
  component: WebUiAlert,
  title: 'WebUi/Alert',
  tags: ['autodocs'],
  args: {
    alertType: 'info',
    title: 'Alert Title',
    message: 'This is an alert message.',
  },
} satisfies Meta<typeof WebUiAlert>
export default meta

type Story = StoryObj<typeof meta>

export const Success: Story = {
  args: {
    alertType: 'success',
    title: 'Success!',
    message: 'Your action was completed successfully.',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Success!')).toBeInTheDocument()
  },
}

export const Info: Story = {
  args: {
    alertType: 'info',
    title: 'Information',
    message: 'Here is some important information.',
  },
}

export const Warning: Story = {
  args: {
    alertType: 'warning',
    title: 'Warning',
    message: 'Please be aware of this warning.',
  },
}

export const ErrorAlert: Story = {
  args: {
    alertType: 'error',
    title: 'Error',
    message: 'An error has occurred.',
  },
}

export const WithLink: Story = {
  args: {
    alertType: 'info',
    title: 'Info with Link',
    message: 'Click the link to learn more.',
    messageLink: '/about',
    messageLinkText: 'Learn More',
  },
}

export const TitleOnly: Story = {
  args: {
    alertType: 'success',
    title: 'Success!',
  },
}
